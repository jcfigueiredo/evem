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
 * runs the library from source, not from npm, so its footer says which code that is.
 */
export function stampHtml(html: string, build: SiteBuild): string {
  return html
    .replaceAll('%EVEM_VERSION%', build.version)
    .replaceAll('%EVEM_COMMIT_URL%', `${REPOSITORY}/commit/${build.commit}`)
    .replaceAll('%EVEM_COMMIT%', build.commit.slice(0, 7));
}

/** The build this is: the version from package.json, the commit from GitHub Actions (`GITHUB_SHA`), else from git */
export function siteBuild(env: Record<string, string | undefined> = process.env): SiteBuild {
  const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  const commit =
    env['GITHUB_SHA'] ??
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: new URL('.', import.meta.url), encoding: 'utf8' }).trim();
  return { version, commit };
}
