# Development guide

## Trying it out locally

### Example

```bash
tmp=$(mktemp -d) && touch "$tmp"/{path,env}
export RUNNER_TEMP="$tmp" GITHUB_PATH="$tmp/path" GITHUB_ENV="$tmp/env"
env PATH="$(pwd)/.tools:$PATH" INPUT_CRYSTAL=nightly INPUT_SHARDS=true INPUT_TOKEN="$personal_access_token" INSTALL_CRYSTAL_PLATFORM=win32 node index.js
```

## Pre-commit

Make sure that `npm test` passes. A pre-commit hook is available: `git config core.hooksPath .tools/hooks`.

## CI

Continuous testing runs on GitHub Actions. Make sure that _.github/workflows/main.yml_ and _release.yml_ stay in sync, other than the differences that they already have.

## Cutting a release

Switch to _master_ branch, in a clean state. Run `.tools/release.sh x.y.z` (an actual next version number). You will be switched to the _v1_ branch, _node_modules_ will be populated, and a tag will be created. The final command to push all this will be only printed. Run it. After this, a release also needs to be published on GitHub Marketplace.

### _node_modules_

The _node_modules_ directory must not be present in the _master_ branch. _package-lock.json_ will be present, though.
