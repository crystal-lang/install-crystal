install-crystal
===============

[GitHub Action][] to **install [Crystal][] programming language**

Currently works only on Windows, always downloads the latest "nightly" build.

## Examples

```yaml
steps:
  - uses: oprypin/install-crystal@v1
  - run: crystal eval "puts 1337"
```

## Usage

### Inputs

* **`token: ${{ github.token }}`**

  Personal access token (auto-populated).

* **`destination: some/path`**

  The directory to store Crystal in, after extracting.

### Outputs

* **`crystal`** (`${{ steps.some_step_id.outputs.crystal }}`)

  The actual version of Crystal (as a ref in crystal-lang/[crystal.git][]) that was installed.


[github action]: https://github.com/features/actions
[crystal]: https://crystal-lang.org/
[crystal.git]: https://github.com/crystal-lang/crystal
