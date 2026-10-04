# Releasing

Publishing a GitHub release tagged `v<version>` starts the [Release workflow](../.github/workflows/release.yml), which publishes the package to npm. `pnpm release` prepares and creates that GitHub release.

## One-time setup

- **npm:** the `@jcfigueiredo` scope belongs to the npm user `jcfigueiredo`. The package uses [trusted publishing](https://docs.npmjs.com/trusted-publishers/): on npmjs.com, the package's Settings list this repository's `release.yml` as a trusted publisher (GitHub Actions, `jcfigueiredo` / `evem`, no environment) allowed to `npm publish`. npm then accepts publishes from that workflow without a token, and signs their provenance. The workflow needs npm 11.5.1 or later, which it installs over the npm that comes with Node.js 22. No secret is stored; to change the trusted publisher, delete it on npmjs.com and add a new one.
- **GitHub CLI:** install [`gh`](https://cli.github.com) and run `gh auth login`.

Version 0.3.0 was the first publish, made with a granular access token (`NPM_TOKEN`), since npm sets up trusted publishing per package, once the package exists.

## Recording changes

As you make changes, describe them under `## Unreleased` at the top of `CHANGELOG.md`. A heading with the version, `## 0.4.0 (unreleased)`, works too. That section becomes the release notes.

## Making a release

```bash
pnpm release 0.3.1 --dry-run   # run the checks and preview the release notes
pnpm release 0.3.1             # release
```

From an up-to-date `main` with no uncommitted changes, `pnpm release <version>`:

1. checks that the tag `v<version>` doesn't exist yet, that the version isn't lower than the one in `package.json`, and that `CHANGELOG.md` has a non-empty unreleased section for it;
2. shows the plan and the release notes, and asks for confirmation (`--yes` skips it);
3. dates the changelog section (`## 0.3.1 (2026-10-02)`) and sets `version` in `package.json`;
4. runs `pnpm check` (format check, type check, tests and package check);
5. commits `Release v<version>` and pushes it to `main`;
6. creates the GitHub release `v<version>` on that commit, with the changelog section as its notes.

The Release workflow then checks that the tag matches `package.json`, runs the checks again and publishes with provenance. Follow it in the Actions tab, then check the result with `npm view @jcfigueiredo/evem version`.

Versions are `major.minor.patch`. Pre-releases (`1.0.0-rc.1`) aren't supported: the workflow would publish them as the latest version.

## When something fails

- **A check before the release commit fails:** nothing was changed. If `pnpm check` failed, `package.json` and `CHANGELOG.md` are put back as they were.
- **The push fails:** the release commit is only local. Undo it with `git reset --hard origin/main`, fix the problem and run `pnpm release` again.
- **Creating the GitHub release fails:** the release commit is on `main`, and the script prints the `gh release create` command that finishes the release.
- **The Release workflow fails** (a trusted publisher that doesn't match the workflow, for example: npm answers 404 or 403 to the publish): the GitHub release exists but nothing was published. Fix the cause, then re-run the workflow from the Actions tab.
