# Maintaining & releasing `cron-naturally`

This package ships with four automation files under `.github/`:

| File | What it does |
| --- | --- |
| `.github/workflows/ci.yml` | On every push/PR to `main`: lint, type-check, test, build the library, build the demo site. Runs on supported versions of Node. |
| `.github/workflows/release.yml` | On a published GitHub Release: re-verifies, checks the tag matches `package.json`, then publishes to npm with provenance. |
| `.github/workflows/pages.yml` | On push to `main`: builds the demo site (bundling the real library) and deploys it to GitHub Pages. The bundle is built in CI, not committed. |
| `.github/dependabot.yml` | Weekly updates for the pinned GitHub Actions and dev dependencies. |

## Security model (why it is built this way)

Recent npm supply-chain compromises (a maintainer's long-lived publish token gets phished or leaked, attacker publishes a malicious version) are designed out here:

- **No long-lived npm token.** Publishing authenticates with **npm Trusted Publishing (OIDC)** — GitHub mints a short-lived identity token per run; there is no `NPM_TOKEN` secret to steal. This is the single biggest mitigation.
- **Provenance / signing.** `npm publish --provenance` signs the build via Sigstore and links it to this repo + commit + workflow. Consumers (and you) can verify the package was built by this CI, not a laptop. `publishConfig.provenance` also forces it for any manual publish.
- **SHA-pinned actions.** Every `uses:` is pinned to a full commit SHA, not a tag, so a hijacked tag can't inject code. Dependabot rolls them forward.
- **Least privilege.** The default `GITHUB_TOKEN` is read-only; `id-token: write` is granted only to the publish job. `persist-credentials: false` keeps the checkout token out of git config.
- **Manual gate.** Publishing runs inside a protected `release` environment that requires your approval before it proceeds.
- **Tag/version guard.** The release job fails if the git tag and `package.json` version disagree.

---

## Cutting a release

```bash
# 1. bump the version (updates package.json, creates a commit + tag)
npm version patch        # or minor / major

# 2. push the commit and the tag
git push --follow-tags
```

Then on GitHub → **Releases → Draft a new release**, choose the `vX.Y.Z` tag you just pushed, write notes, **Publish release**. That fires `release.yml`; approve the `release` environment when prompted, and it publishes to npm with provenance.

Verify afterward:

```bash
npm view cron-naturally version
# the npm package page shows a "Provenance" panel linking to this repo + run
```

## Local commands

```bash
npm test            # vitest
npm run lint        # biome (library source)
npm run check-types # tsc --noEmit
npm run build       # emit dist/ with declarations
npm run serve:site  # preview the demo at http://localhost:8731
```
