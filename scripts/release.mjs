// Releases a new version: `pnpm release <version> [--dry-run] [--yes]` (see USAGE).
// It dates the version's CHANGELOG.md section, sets the version in package.json, runs `pnpm check`,
// commits and pushes to main, then creates the GitHub release `v<version>`. Publishing that release
// starts .github/workflows/release.yml, which publishes the package to npm.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const USAGE = `Usage: pnpm release <version> [--dry-run] [--yes]

Releases <version> (e.g. 0.3.1) from an up-to-date, clean main branch:
  1. dates its CHANGELOG.md section: "## Unreleased" or "## <version> (unreleased)"
  2. sets "version" in package.json
  3. runs pnpm check
  4. commits "Release v<version>" and pushes it to main
  5. creates the GitHub release v<version>; its workflow publishes the package to npm

Options:
  --dry-run  run the checks and show the release notes, without changing anything
  --yes, -y  don't ask for confirmation (needed when not running in a terminal)`;

const OPTIONS = ['--dry-run', '--yes', '-y', '--help', '-h'];
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** A problem to report without a stack trace */
class ReleaseError extends Error {}

/**
 * Runs a command. With `capture` (the default) its output is returned; otherwise it goes to the
 * terminal. Throws a ReleaseError when the command fails, unless `allowFailure`.
 */
function run(command, args, { capture = true, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    // pnpm is a .cmd script on Windows, which only runs through a shell
    shell: process.platform === 'win32' && command === 'pnpm'
  });
  const ok = !result.error && result.status === 0;
  const stdout = (result.stdout ?? '').trim();
  const stderr = (result.stderr ?? '').trim() || (result.error?.message ?? '');
  if (!ok && !allowFailure) {
    throw new ReleaseError(`\`${command} ${args.join(' ')}\` failed${stderr ? `:\n${stderr}` : ''}`);
  }
  return { ok, stdout, stderr };
}

const git = (...args) => run('git', args).stdout;

function today() {
  const now = new Date();
  const pad = number => String(number).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseVersion(text) {
  const match = VERSION.exec(text);
  return match ? match.slice(1).map(Number) : undefined;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * Finds the unreleased section at the top of the changelog ("## Unreleased" or
 * "## <version> (unreleased)") and returns its notes and the changelog with the section dated.
 */
function dateChangelogSection(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex(line => line.startsWith('## '));
  const heading = start === -1 ? undefined : lines[start].trim();
  const unreleased = heading && /^## (?:unreleased|(\S+) \(unreleased\))$/i.exec(heading);
  if (!unreleased) {
    const latest = heading ? `Its latest section, "${heading}", is already released. ` : '';
    throw new ReleaseError(
      `CHANGELOG.md has no unreleased section. ${latest}Add a "## Unreleased" section at the top describing the changes in ${version}.`
    );
  }
  if (unreleased[1] && unreleased[1] !== version) {
    throw new ReleaseError(
      `CHANGELOG.md's unreleased section is for ${unreleased[1]} ("${heading}"), not ${version}. ` +
        `Release ${unreleased[1]}, or rename the heading to "## Unreleased".`
    );
  }

  const next = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  const notes = lines
    .slice(start + 1, next === -1 ? lines.length : next)
    .join('\n')
    .trim();
  if (!notes) {
    throw new ReleaseError(`CHANGELOG.md's "${heading}" section is empty: describe the changes in ${version} first.`);
  }

  const dated = `## ${version} (${today()})`;
  lines[start] = dated;
  return { heading, dated, notes, changelog: lines.join('\n') };
}

/** package.json with only its "version" line changed, so the formatting stays as it is */
function setPackageVersion(text, version) {
  const pkg = JSON.parse(text);
  if (pkg.version === version) return text;
  const updated = text.replace(/^(\s*"version"\s*:\s*)"[^"]*"/m, `$1"${version}"`);
  if (JSON.stringify({ ...JSON.parse(updated), version: pkg.version }) !== JSON.stringify(pkg)) {
    throw new ReleaseError('Couldn\'t update "version" in package.json: set it by hand and run pnpm release again.');
  }
  return updated;
}

function checkGitState(tag) {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'main') {
    throw new ReleaseError(`Releases are made from main, but you're on ${branch}.`);
  }
  if (git('status', '--porcelain')) {
    throw new ReleaseError('The working tree has uncommitted changes: commit or stash them first.');
  }

  git('fetch', '--quiet', 'origin', 'main');
  const [ahead, behind] = git('rev-list', '--left-right', '--count', 'HEAD...origin/main').split(/\s+/).map(Number);
  if (behind > 0) {
    throw new ReleaseError(`main is ${behind} commit(s) behind origin/main: pull first.`);
  }
  if (ahead > 0) {
    throw new ReleaseError(
      `main has ${ahead} commit(s) that aren't on origin/main: push them, and let CI pass, first.`
    );
  }

  const tagExists =
    run('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`], { allowFailure: true }).ok ||
    git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`) !== '';
  if (tagExists) {
    throw new ReleaseError(`The tag ${tag} already exists: that version has been released already.`);
  }
}

/** Why the GitHub CLI can't create the release, if it can't */
function githubCliProblem() {
  if (!run('gh', ['--version'], { allowFailure: true }).ok) {
    return "The GitHub CLI (gh) isn't installed: see https://cli.github.com";
  }
  if (!run('gh', ['auth', 'status'], { allowFailure: true }).ok) {
    return "The GitHub CLI isn't logged in: run `gh auth login`.";
  }
  return undefined;
}

async function confirm(question) {
  if (!process.stdin.isTTY) {
    throw new ReleaseError("Can't ask for confirmation outside a terminal: pass --yes to release without asking.");
  }
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await readline.question(`${question} [y/N] `)).trim());
  } finally {
    readline.close();
  }
}

async function main(argv) {
  const options = argv.filter(arg => arg.startsWith('-'));
  const positional = argv.filter(arg => !arg.startsWith('-'));
  if (options.includes('--help') || options.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const unknown = options.filter(option => !OPTIONS.includes(option));
  if (unknown.length > 0) {
    throw new ReleaseError(`Unknown option: ${unknown.join(', ')}\n\n${USAGE}`);
  }
  if (positional.length !== 1) {
    throw new ReleaseError(USAGE);
  }
  const dryRun = options.includes('--dry-run');
  const yes = options.includes('--yes') || options.includes('-y');

  const version = positional[0].replace(/^v/, '');
  const tag = `v${version}`;
  if (/^\d+\.\d+\.\d+-/.test(version)) {
    throw new ReleaseError(
      `${version} is a pre-release version, which isn't supported: the release workflow would publish it as the latest version.`
    );
  }
  const parsed = parseVersion(version);
  if (!parsed) {
    throw new ReleaseError(`"${positional[0]}" isn't a valid version: use major.minor.patch, e.g. 0.3.1.`);
  }

  process.chdir(git('rev-parse', '--show-toplevel'));
  checkGitState(tag);

  const packageText = readFileSync('package.json', 'utf8');
  const currentVersion = JSON.parse(packageText).version;
  if (compareVersions(parsed, parseVersion(currentVersion) ?? [0, 0, 0]) < 0) {
    throw new ReleaseError(`${version} is lower than the version in package.json (${currentVersion}).`);
  }
  const changelogText = readFileSync('CHANGELOG.md', 'utf8');
  const section = dateChangelogSection(changelogText, version);
  const updatedPackageText = setPackageVersion(packageText, version);

  const ghProblem = githubCliProblem();
  if (ghProblem && !dryRun) {
    throw new ReleaseError(ghProblem);
  }

  const versionChange = currentVersion === version ? `${version} (unchanged)` : `${currentVersion} → ${version}`;
  console.log(`Release ${tag}
  CHANGELOG.md   "${section.heading}" → "${section.dated}"
  package.json   version ${versionChange}
  Then: pnpm check, commit "Release ${tag}", push to main, create the GitHub release ${tag}

Release notes:

${section.notes}
`);

  if (dryRun) {
    if (ghProblem) console.warn(`Warning: ${ghProblem}`);
    console.log('Dry run: nothing was changed.');
    return;
  }
  if (!yes && !(await confirm(`Release ${tag} and publish it to npm?`))) {
    console.log('Cancelled: nothing was changed.');
    return;
  }

  writeFileSync('package.json', updatedPackageText);
  writeFileSync('CHANGELOG.md', section.changelog);
  console.log('Running pnpm check...');
  if (!run('pnpm', ['check'], { capture: false, allowFailure: true }).ok) {
    writeFileSync('package.json', packageText);
    writeFileSync('CHANGELOG.md', changelogText);
    throw new ReleaseError(
      'pnpm check failed, so nothing was released: package.json and CHANGELOG.md are back as they were.'
    );
  }

  git('add', 'package.json', 'CHANGELOG.md');
  git('commit', '--quiet', '-m', `Release ${tag}`);
  const sha = git('rev-parse', 'HEAD');

  const push = run('git', ['push', '--quiet', 'origin', 'HEAD:main'], { allowFailure: true });
  if (!push.ok) {
    throw new ReleaseError(
      `Pushing to origin/main failed:\n${push.stderr}\n\n` +
        'The release commit is only local, and nothing was released. Undo it with\n' +
        '  git reset --hard origin/main\n' +
        `then fix the problem and run pnpm release ${version} again.`
    );
  }

  const notesDir = mkdtempSync(join(tmpdir(), 'evem-release-'));
  const notesFile = join(notesDir, 'notes.md');
  writeFileSync(notesFile, `${section.notes}\n`);
  const releaseArgs = ['release', 'create', tag, '--target', sha, '--title', tag, '--notes-file', notesFile];
  const created = run('gh', releaseArgs, { allowFailure: true });
  if (!created.ok) {
    // The notes file is kept for the command below
    throw new ReleaseError(
      `Creating the GitHub release failed:\n${created.stderr}\n\n` +
        `The release commit is on main. Once the problem is fixed, create the release with\n  gh ${releaseArgs.join(' ')}`
    );
  }
  rmSync(notesDir, { recursive: true, force: true });

  const repoUrl = run('gh', ['repo', 'view', '--json', 'url', '--jq', '.url'], { allowFailure: true });
  const workflow = repoUrl.ok && repoUrl.stdout ? `${repoUrl.stdout}/actions/workflows/release.yml` : 'the Actions tab';
  console.log(`\nReleased ${tag}: ${created.stdout}`);
  console.log(`The Release workflow is publishing it to npm; follow it at ${workflow}`);
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof ReleaseError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
