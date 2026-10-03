import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { siteBuild, stampHtml } from '../../demo/src/siteStamp';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

describe('the site stamp', () => {
  it("fills the pages' placeholders with the library's version and the commit the site was built from", () => {
    const html = '<p>EvEm %EVEM_VERSION%, <a href="%EVEM_COMMIT_URL%">%EVEM_COMMIT%</a></p>';
    expect(stampHtml(html, { version: '0.3.0', commit: '0123456789abcdef0123456789abcdef01234567' })).toBe(
      '<p>EvEm 0.3.0, <a href="https://github.com/jcfigueiredo/evem/commit/0123456789abcdef0123456789abcdef01234567">0123456</a></p>'
    );
  });

  it('reads the version from package.json and the commit from GitHub Actions, else from git', () => {
    expect(siteBuild({ GITHUB_SHA: 'feedface' })).toEqual({ version, commit: 'feedface' });
    expect(siteBuild({}).commit).toMatch(/^[0-9a-f]{40}$/);
    expect(siteBuild({ GITHUB_SHA: '' }).commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('builds without git (a source download, or git not installed): the commit is unknown, and links to the repository', () => {
    const build = siteBuild({}, () => undefined);
    expect(build).toEqual({ version, commit: '' });
    expect(stampHtml('<a href="%EVEM_COMMIT_URL%">%EVEM_COMMIT%</a>', build)).toBe(
      '<a href="https://github.com/jcfigueiredo/evem">unknown</a>'
    );
  });
});
