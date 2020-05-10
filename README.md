install-crystal
===============

[GitHub Action][] to **install [Crystal][] programming language**

Works on Ubuntu, macOS, Windows.

## Examples

```yaml
steps:
  - uses: oprypin/install-crystal@v1
  - run: crystal eval "puts 1337"
  - uses: actions/checkout@v2
  - run: crystal spec
```

Also see [.github/workflows/release.yml](.github/workflows/release.yml) as an example.

## Usage

### Inputs

* **`crystal: 0.34.0`** (not supported on Windows)

  Install a particular release of Crystal.

* **`crystal: latest`** (default; not supported on Windows)

  Install the latest released version of Crystal.

* **`crystal: nightly`** (default on Windows)

  Install Crystal from the latest continuous build on [crystal.git][] master.

* **`arch: x86_64`**, **`arch: x86`** (defaults to current OS arch)

  The architecture of the build of Crystal to download.

* **`destination: some/path`**

  The directory to store Crystal in, after extracting.

* **`token: ${{ github.token }}`**

  Personal access token (auto-populated).

### Outputs

* **`crystal`** (`${{ steps.some_step_id.outputs.crystal }}`)

  The actual version of Crystal (as a ref in crystal-lang/[crystal.git][]) that was installed.


[github action]: https://github.com/features/actions
[crystal]: https://crystal-lang.org/
[crystal.git]: https://github.com/crystal-lang/crystal
