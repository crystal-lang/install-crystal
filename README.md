install-crystal
===============

[GitHub Action][] to **install [Crystal][] programming language** and [Shards][] package manager.

Works on Ubuntu, macOS, Windows.

### Quickstart

**[Configurator][]**: get a pre-made config for your exact use case!

## Examples

```yaml
steps:
  - uses: oprypin/install-crystal@v1
  - run: crystal eval "puts 1337"
```

```yaml
steps:
  - uses: actions/checkout@v2
  - uses: oprypin/install-crystal@v1
    with:
      crystal: 0.35.1
  - run: shards install
  - run: crystal spec
```

```yaml
    strategy:
      fail-fast: false
      matrix:
        include:
          - {os: ubuntu-latest, crystal: latest}
          - {os: ubuntu-latest, crystal: nightly}
          - {os: macos-latest}
          - {os: windows-latest}
    runs-on: ${{matrix.os}}
    steps:
      - uses: oprypin/install-crystal@v1
        with:
          crystal: ${{matrix.crystal}}
      - uses: actions/checkout@v2
      - run: shards install
      - run: crystal spec
      - run: crystal tool format --check
        if: matrix.crystal == 'latest'
```

[Find usages in the wild!](https://github.com/search?l=YAML&q=%22oprypin%2Finstall-crystal%22&type=Code)

Alternatively, you can use the container-based approach [as in the starter workflow][crystal-starter] (without this action), but the advantage here is the unified approach to installation across 3 systems. [Using a custom container has disadvantages on its own, too](https://forum.crystal-lang.org/t//2837).

## Usage

### Inputs

 *   *  **`crystal: 0.35.1`** (not supported on Windows)

        Install a particular release of Crystal.

     *  **`crystal: latest`** (default; not supported on Windows)

        Install the latest released version of Crystal.

     *  **`crystal: nightly`** (default on Windows)

        Install Crystal from the latest continuous build on [crystal.git][] master.

 *   *  **`shards: true`** (default)

        Ensure that *some* released version of [Shards][] is available.
        This uses the build that's bundled with Crystal's releases. Other options are slower, as building Shards is a necessary step then.

     *  **`shards: false`**

        Ensure that `shards` executable is *not* available.

     *  **`shards: latest`**

        Build and install the latest released version of Shards.

     *  **`shards: 0.13.0`**

        Build and install a particular release of Shards.

     *  **`shards: nightly`**

        Build and install the latest commit of [shards.git][] master.

 *  **`arch: x86_64`**, **`arch: x86`** (defaults to current OS arch)

    The architecture of the build of Crystal to download.

 *  **`destination: some/path`**

    The directory to store Crystal in, after extracting. Will directly affect `outputs.path` (the default is in a temporary location).

 *  **`token: ${{ github.token }}`**

    Personal access token (auto-populated).

### Outputs

 *  **`crystal`** (`${{ steps.some_step_id.outputs.crystal }}`)

    The actual version of Crystal (as a ref in crystal-lang/[crystal.git][]) that was installed.

 *  **`shards`** (`${{ steps.some_step_id.outputs.shards }}`)

    The actual version of Shards (as a ref in crystal-lang/[shards.git][]) that was installed.

 *  **`path`** (`${{ steps.some_step_id.outputs.path }}`)

    The path where Crystal was extracted to, so you can use '[path]/bin/crystal', '[path]/src' etc.

[github action]: https://github.com/features/actions
[crystal]: https://crystal-lang.org/
[crystal.git]: https://github.com/crystal-lang/crystal
[shards]: https://github.com/crystal-lang/shards
[shards.git]: https://github.com/crystal-lang/shards
[crystal-starter]: https://github.com/actions/starter-workflows/blob/master/ci/crystal.yml
[configurator]: https://oprypin.github.io/install-crystal/configurator.html
