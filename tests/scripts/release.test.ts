import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Runs scripts/release.mjs in a throwaway repository whose origin is a local bare repository,
 * with fake `gh` and `pnpm` executables that log their arguments instead of doing anything.
 */

const script = resolve(__dirname, '../../scripts/release.mjs');

const PACKAGE_JSON = `{
  "name": "@jcfigueiredo/evem",
  "version": "0.3.0",
  "description": "A test package",
  "scripts": {
    "check": "echo checked"
  }
}
`;

const CHANGELOG = `# Changelog

## 0.3.0 (unreleased)

First release.

### Added

- Everything.

## 0.1.0

- The start.
`;

const FAKE_GH = `#!/bin/sh
echo "gh $*" >> "$FAKE_LOG"
case "$1 $2" in
  "auth status")
    if [ -n "$FAKE_GH_UNAUTHENTICATED" ]; then echo "You are not logged in" >&2; exit 1; fi ;;
  "release create")
    while [ $# -gt 0 ]; do
      if [ "$1" = "--notes-file" ]; then cp "$2" "$FAKE_NOTES"; fi
      shift
    done
    if [ -n "$FAKE_GH_RELEASE_FAIL" ]; then echo "HTTP 403" >&2; exit 1; fi
    echo "https://github.com/jcfigueiredo/evem/releases/tag/v-fake" ;;
  "repo view")
    echo "https://github.com/jcfigueiredo/evem" ;;
esac
exit 0
`;

const FAKE_PNPM = `#!/bin/sh
echo "pnpm $*" >> "$FAKE_LOG"
if [ -n "$FAKE_PNPM_FAIL" ]; then echo "tests failed" >&2; exit 1; fi
exit 0
`;

interface Repo {
  dir: string;
  origin: string;
  log: string;
  notes: string;
  env: NodeJS.ProcessEnv;
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'evem-release-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function createRepo(files: { packageJson?: string; changelog?: string } = {}): Repo {
  const bin = join(root, 'bin');
  mkdirSync(bin);
  for (const [name, content] of [
    ['gh', FAKE_GH],
    ['pnpm', FAKE_PNPM]
  ] as const) {
    writeFileSync(join(bin, name), content);
    chmodSync(join(bin, name), 0o755);
  }

  const origin = join(root, 'origin.git');
  const dir = join(root, 'work');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    FAKE_LOG: join(root, 'calls.log'),
    FAKE_NOTES: join(root, 'notes.md'),
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com'
  };
  for (const key of ['FAKE_GH_UNAUTHENTICATED', 'FAKE_GH_RELEASE_FAIL', 'FAKE_PNPM_FAIL']) delete env[key];

  git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
  mkdirSync(dir);
  git(dir, 'init', '--quiet', '--initial-branch=main');
  git(dir, 'remote', 'add', 'origin', origin);
  writeFileSync(join(dir, 'package.json'), files.packageJson ?? PACKAGE_JSON);
  writeFileSync(join(dir, 'CHANGELOG.md'), files.changelog ?? CHANGELOG);
  commitAll(dir, env, 'Initial commit');
  pushMain(dir, env);
  return { dir, origin, log: env.FAKE_LOG!, notes: env.FAKE_NOTES!, env };
}

function commitAll(dir: string, env: NodeJS.ProcessEnv, message: string): void {
  spawnSync('git', ['add', '-A'], { cwd: dir, env });
  const result = spawnSync('git', ['commit', '--quiet', '-m', message], { cwd: dir, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function pushMain(dir: string, env: NodeJS.ProcessEnv): void {
  const result = spawnSync('git', ['push', '--quiet', '-u', 'origin', 'main'], { cwd: dir, env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function release(repo: Repo, args: string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repo.dir,
    env: { ...repo.env, ...env },
    encoding: 'utf8'
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: result.stdout + result.stderr };
}

const calls = (repo: Repo): string[] => (existsSync(repo.log) ? readFileSync(repo.log, 'utf8').trim().split('\n') : []);
const read = (repo: Repo, file: string) => readFileSync(join(repo.dir, file), 'utf8');
const originHead = (repo: Repo) => git(repo.origin, 'rev-parse', 'main');
const originSubject = (repo: Repo) => git(repo.origin, 'log', '-1', '--format=%s', 'main');

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

describe('pnpm release', () => {
  it('dates the changelog section, runs the checks, pushes a release commit and creates the GitHub release', () => {
    const repo = createRepo();

    const result = release(repo, ['0.3.0', '--yes']);

    expect(result.status, result.output).toBe(0);
    expect(read(repo, 'CHANGELOG.md')).toBe(CHANGELOG.replace('## 0.3.0 (unreleased)', `## 0.3.0 (${today()})`));
    expect(read(repo, 'package.json')).toBe(PACKAGE_JSON);
    expect(originSubject(repo)).toBe('Release v0.3.0');
    expect(git(repo.dir, 'status', '--porcelain')).toBe('');

    const sha = originHead(repo);
    expect(calls(repo)).toContain('pnpm check');
    expect(calls(repo)).toContainEqual(
      expect.stringMatching(
        new RegExp(`^gh release create v0\\.3\\.0 --target ${sha} --title v0\\.3\\.0 --notes-file \\S+$`)
      )
    );
    // pnpm check runs before anything is committed or released
    expect(calls(repo).findIndex(call => call === 'pnpm check')).toBeLessThan(
      calls(repo).findIndex(call => call.startsWith('gh release create'))
    );
    expect(readFileSync(repo.notes, 'utf8').trim()).toBe('First release.\n\n### Added\n\n- Everything.');
    expect(result.stdout).toContain('https://github.com/jcfigueiredo/evem/actions/workflows/release.yml');
  });

  it('sets the version in package.json, changing only that line, and dates an "## Unreleased" section', () => {
    const changelog = '# Changelog\n\n## Unreleased\n\n- A fix.\n\n## 0.3.0 (2026-10-01)\n\n- First release.\n';
    const repo = createRepo({ changelog });

    const result = release(repo, ['v0.3.1', '--yes']);

    expect(result.status, result.output).toBe(0);
    expect(read(repo, 'package.json')).toBe(PACKAGE_JSON.replace('"version": "0.3.0"', '"version": "0.3.1"'));
    expect(read(repo, 'CHANGELOG.md')).toBe(changelog.replace('## Unreleased', `## 0.3.1 (${today()})`));
    expect(originSubject(repo)).toBe('Release v0.3.1');
    expect(readFileSync(repo.notes, 'utf8').trim()).toBe('- A fix.');
  });

  it('changes nothing with --dry-run, and shows the plan and the release notes', () => {
    const repo = createRepo();
    const head = originHead(repo);

    const result = release(repo, ['0.3.0', '--dry-run']);

    expect(result.status, result.output).toBe(0);
    expect(result.stdout).toContain(`## 0.3.0 (${today()})`);
    expect(result.stdout).toContain('- Everything.');
    expect(result.stdout).toMatch(/dry run/i);
    expect(read(repo, 'CHANGELOG.md')).toBe(CHANGELOG);
    expect(originHead(repo)).toBe(head);
    expect(calls(repo).filter(call => call.startsWith('pnpm') || call.startsWith('gh release'))).toEqual([]);
  });

  it('restores package.json and CHANGELOG.md, and releases nothing, when pnpm check fails', () => {
    const changelog = '# Changelog\n\n## Unreleased\n\n- A fix.\n';
    const repo = createRepo({ changelog });
    const head = originHead(repo);

    const result = release(repo, ['0.4.0', '--yes'], { FAKE_PNPM_FAIL: '1' });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/pnpm check failed/);
    expect(read(repo, 'package.json')).toBe(PACKAGE_JSON);
    expect(read(repo, 'CHANGELOG.md')).toBe(changelog);
    expect(git(repo.dir, 'status', '--porcelain')).toBe('');
    expect(originHead(repo)).toBe(head);
    expect(calls(repo).filter(call => call.startsWith('gh release'))).toEqual([]);
  });

  it('explains how to recover when the push fails, and creates no release', () => {
    const repo = createRepo();
    git(repo.dir, 'remote', 'set-url', '--push', 'origin', join(root, 'missing.git'));

    const result = release(repo, ['0.3.0', '--yes']);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/push/i);
    expect(result.stderr).toContain('git reset --hard origin/main');
    expect(calls(repo).filter(call => call.startsWith('gh release'))).toEqual([]);
  });

  it('prints the command to finish the release when creating the GitHub release fails', () => {
    const repo = createRepo();

    const result = release(repo, ['0.3.0', '--yes'], { FAKE_GH_RELEASE_FAIL: '1' });

    expect(result.status).toBe(1);
    expect(originSubject(repo)).toBe('Release v0.3.0');
    expect(result.stderr).toContain(
      `gh release create v0.3.0 --target ${originHead(repo)} --title v0.3.0 --notes-file`
    );
  });

  it("asks for --yes when it can't ask for confirmation", () => {
    const repo = createRepo();

    const result = release(repo, ['0.3.0']);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--yes/);
    expect(read(repo, 'CHANGELOG.md')).toBe(CHANGELOG);
    expect(calls(repo).filter(call => call.startsWith('pnpm') || call.startsWith('gh release'))).toEqual([]);
  });

  describe('refuses to release', () => {
    const refusals: Array<[string, (repo: Repo) => void, string[], RegExp, NodeJS.ProcessEnv?]> = [
      ['without a version', () => {}, [], /Usage: pnpm release <version>/],
      ['with an unknown option', () => {}, ['0.3.0', '--force'], /Unknown option: --force/],
      ['an invalid version', () => {}, ['0.3'], /isn't a valid version/],
      ['a pre-release version', () => {}, ['1.0.0-rc.1'], /[Pp]re-release/],
      ["a version lower than package.json's", () => {}, ['0.2.9', '--yes'], /lower than/],
      [
        'from another branch',
        repo => git(repo.dir, 'checkout', '--quiet', '-b', 'feature'),
        ['0.3.0', '--yes'],
        /from main.*feature/s
      ],
      [
        'with uncommitted changes',
        repo => writeFileSync(join(repo.dir, 'notes.txt'), 'draft'),
        ['0.3.0', '--yes'],
        /uncommitted changes/
      ],
      [
        'when main is behind origin',
        repo => {
          writeFileSync(join(repo.dir, 'extra.txt'), 'x');
          commitAll(repo.dir, repo.env, 'Extra');
          pushMain(repo.dir, repo.env);
          git(repo.dir, 'reset', '--quiet', '--hard', 'HEAD~1');
        },
        ['0.3.0', '--yes'],
        /behind origin\/main/
      ],
      [
        'when main has unpushed commits',
        repo => {
          writeFileSync(join(repo.dir, 'extra.txt'), 'x');
          commitAll(repo.dir, repo.env, 'Extra');
        },
        ['0.3.0', '--yes'],
        /aren't on origin\/main/
      ],
      [
        'a version whose tag exists on origin',
        repo => {
          git(repo.dir, 'tag', 'v0.3.0');
          git(repo.dir, 'push', '--quiet', 'origin', 'v0.3.0');
          git(repo.dir, 'tag', '-d', 'v0.3.0');
        },
        ['0.3.0', '--yes'],
        /v0\.3\.0 already exists/
      ],
      [
        'a version without an unreleased changelog section',
        repo => {
          writeFileSync(join(repo.dir, 'CHANGELOG.md'), '# Changelog\n\n## 0.3.0 (2026-10-01)\n\n- First.\n');
          commitAll(repo.dir, repo.env, 'Dated');
          pushMain(repo.dir, repo.env);
        },
        ['0.3.1', '--yes'],
        /## Unreleased/
      ],
      [
        'a version other than the one the changelog section is for',
        () => {},
        ['0.4.0', '--yes'],
        /unreleased section is for 0\.3\.0/
      ],
      [
        'with an empty changelog section',
        repo => {
          writeFileSync(
            join(repo.dir, 'CHANGELOG.md'),
            '# Changelog\n\n## Unreleased\n\n## 0.3.0 (2026-10-01)\n\n- First.\n'
          );
          commitAll(repo.dir, repo.env, 'Empty');
          pushMain(repo.dir, repo.env);
        },
        ['0.3.1', '--yes'],
        /is empty/
      ],
      [
        "when the GitHub CLI isn't logged in",
        () => {},
        ['0.3.0', '--yes'],
        /gh auth login/,
        { FAKE_GH_UNAUTHENTICATED: '1' }
      ]
    ];

    it.each(refusals)('%s', (_name, arrange, args, message, env) => {
      const repo = createRepo();
      arrange(repo);
      const head = originHead(repo);
      const changelog = read(repo, 'CHANGELOG.md');

      const result = release(repo, args, env);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(message);
      expect(read(repo, 'CHANGELOG.md')).toBe(changelog);
      expect(read(repo, 'package.json')).toBe(PACKAGE_JSON);
      expect(originHead(repo)).toBe(head);
      expect(calls(repo).filter(call => call.startsWith('pnpm') || call.startsWith('gh release'))).toEqual([]);
    });
  });
});
