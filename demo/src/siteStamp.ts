import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** What the site was built from: the library's version (package.json) and the commit */
export interface SiteBuild {
  version: string;
  commit: string;
}

const REPOSITORY = 'https://github.com/jcfigueiredo/evem';

/**
 * Fill the pages' build placeholders: `%EVEM_VERSION%`, `%EVEM_COMMIT%` (short) and `%EVEM_COMMIT_URL%`. The site
 * runs the library from source, not from npm, so its footer says which code that is. Without a commit (no git), it
 * says "unknown" and links to the repository.
 */
export function stampHtml(html: string, build: SiteBuild): string {
  return html
    .replaceAll('%EVEM_VERSION%', build.version)
    .replaceAll('%EVEM_COMMIT_URL%', build.commit ? `${REPOSITORY}/commit/${build.commit}` : REPOSITORY)
    .replaceAll('%EVEM_COMMIT%', build.commit ? build.commit.slice(0, 7) : 'unknown');
}

/** The checkout's commit, or undefined where git can't say (not installed, or a source download with no .git) */
function gitHead(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * The build this is: the version from package.json, the commit from GitHub Actions (`GITHUB_SHA`), else from git,
 * else none. It never throws, so the dev server and the build start anywhere.
 */
export function siteBuild(
  env: Record<string, string | undefined> = process.env,
  head: () => string | undefined = gitHead
): SiteBuild {
  const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  return { version, commit: env['GITHUB_SHA'] || head() || '' };
}
