install-crystal
===============

[GitHub Action][] to **install [Crystal][] programming language** and [Shards][] package manager.

Works on Ubuntu, macOS, Windows.

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
      crystal: 0.35.0
  - run: crystal spec
```

```yaml
steps:
  - uses: actions/checkout@v2
  - uses: oprypin/install-crystal@v1
    with:
      shards: true
  - run: shards install
```


[Find usages in the wild!](https://github.com/search?l=YAML&q=%22oprypin%2Finstall-crystal%22&type=Code)

Alternatively, you can use the container-based approach [as in the starter workflow][crystal-starter] (without this action), but the advantage here is the unified approach to installation across 3 systems.

## Usage

### Inputs

* * **`crystal: 0.35.0`** (not supported on Windows)

    Install a particular release of Crystal.

  * **`crystal: latest`** (default; not supported on Windows)

    Install the latest released version of Crystal.

  * **`crystal: nightly`** (default on Windows)

    Install Crystal from the latest continuous build on [crystal.git][] master.

* * **`shards: true`** (default)

    Ensure that *some* released version of [Shards][] is available (or `nightly` on Windows).  
    This uses the build that's bundled with Crystal's releases. Other options are slower, as building Shards is a necessary step then.
    
  * **`shards: false`** (default on Windows)
    
    Ensure that `shards` executable is *not* available.

  * **`shards: latest`** (not supported on Windows)

    Build and install the latest released version of Shards.

  * **`shards: 0.12.0`** (not supported on Windows)

    Build and install a particular release of Shards.

  * **`shards: nightly`**

    Build and install the latest commit of [shards.git][] master.

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
[shards]: https://github.com/crystal-lang/shards
[shards.git]: https://github.com/crystal-lang/shards
[crystal-starter]: https://github.com/actions/starter-workflows/blob/master/ci/crystal.yml
