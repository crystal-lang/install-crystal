<div class="configurator">
<strong>I am developing</strong>
<input type="radio" name="software-kind" id="software-kind-app"><label for="software-kind-app"><strong>an application</strong></label>
<input type="radio" name="software-kind" id="software-kind-lib"><label for="software-kind-lib"><strong>a library</strong> (also track updates of deps)</label>.
<br>
I want to support Linux, <input type="checkbox" id="os-mac"><label for="os-mac">macOS</label>, <input type="checkbox" id="os-win"><label for="os-win">Windows</label>.
<br>
I want to support latest Crystal, <input type="checkbox" id="crystal-ver"><label for="crystal-ver">a particular older version</label> <input type="checkbox" id="crystal-nightly"><label for="crystal-nightly">and follow Crystal nightly</label>.
<br>
<input type="checkbox" id="tool-format"><label for="tool-format">I format code with <code>crystal tool format</code></label>.
<br>
<input type="checkbox" id="cache-shards"><label for="cache-shards">Cache dependencies (worth only if there are many).</label>

{% for is_app in false, true %}
{% for os_win in false, true %}
{% for os_mac in false, true %}
{% for crystal_ver in false, true %}
{% for crystal_nightly in false, true %}
{% for tool_format in false, true %}
{% for cache_shards in false, true %}

<div class="{% for cls in [is_app, not is_app, os_mac, os_win, crystal_ver, crystal_nightly, tool_format, cache_shards] %}{% if cls %}c{{loop.index}} {% endif %}{% endfor %}">

<p>Add this content to your GitHub repository as <code>.github/workflows/ci.yml</code>:</p>

```yaml
on:
  push:
  pull_request:
    branches: [master]
  {%- if crystal_nightly or not is_app %}
  schedule:
    - cron: '0 6 * * 6'  # Every Saturday 6 AM
  {%- endif %}
jobs:
  build:
    {%- set unroll = os_win or (crystal_ver and crystal_nightly) %}
    {%- if os_mac or os_win or crystal_nightly or crystal_ver %}
    strategy:
      fail-fast: false
      matrix:
        {%- if unroll %}
        include:
          - os: ubuntu-latest
          {%- if crystal_ver %}
          - os: ubuntu-latest
            crystal: 0.35.1
          {%- endif %}
          {%- if crystal_nightly %}
          - os: ubuntu-latest
            crystal: nightly
          {%- endif %}
          {%- if os_mac %}
          - os: macos-latest
          {%- endif %}
          {%- if os_win %}
          - os: windows-latest
          {%- endif %}
        {%- else %}
        {%- if os_mac or os_win %}
        os: [ubuntu-latest{% if os_mac %}, macos-latest{% endif %}{% if os_win %}, windows-latest{% endif %}]
        {%- endif %}
        {%- if crystal_nightly or crystal_ver %}
        crystal: [{% if crystal_ver %}0.35.1, {% endif %}latest{% if crystal_nightly %}, nightly{% endif %}]
        {%- endif %}
        {%- endif %}
    {%- endif %}
    runs-on: {% if os_mac or os_win %}{{ "${{ matrix.os }}" }}{% else %}ubuntu-latest{% endif %}
    {%- if crystal_nightly %}
    env:
      SHARDS_OPTS: --ignore-crystal-version
    {%- endif %}
    steps:
      - name: Install Crystal
        uses: oprypin/install-crystal@v1
        {%- if crystal_nightly or crystal_ver %}
        with:
          crystal: {{ "${{ matrix.crystal }}" }}
        {%- endif %}
      - name: Download source
        uses: actions/checkout@v2
      {%- if cache_shards %}
      - name: Cache shards
        uses: actions/cache@v2
        with:
          {%- if is_app %}
          path: lib
          key: {{ "${{ runner.os }}-shards-${{ hashFiles('**/shard.lock') }}" }}
          {%- else %}
          path: ~/.cache/shards
          key: {{ "${{ runner.os }}-shards-${{ hashFiles('shard.yml') }}" }}
          restore-keys: {{ "${{ runner.os }}-shards-" }}
          {%- endif %}
      {%- endif %}
      - name: Install Shards
        {%- if is_app %}
        run: {% if cache_shards %}shards check || {% endif %}shards install
        {%- else %}
        run: shards update
        {%- endif %}
      - name: Run tests
        run: crystal spec
      {%- if is_app %}
      - name: Build
        run: shards build
      {%- endif %}
      {%- if tool_format %}
      - name: Check formatting
        run: crystal tool format --check
        {%- set latest = "== 'latest'" if not unroll else "!= 'nightly'" if not crystal_ver else "== null" -%}
        {%- if os_win and (crystal_nightly or crystal_ver) %}
        if: matrix.crystal {{ latest }} && matrix.os == 'ubuntu-latest'
        {%- elif os_win %}
        if: matrix.os == 'ubuntu-latest'
        {%- elif crystal_nightly or crystal_ver %}
        if: matrix.crystal {{ latest }}{% endif %}
        {%- endif %}
```

{%- if is_app %}
<p>Make sure to check <code>shard.lock</code> in to source control. And <code>shard.yml</code> should be checked in, of course.</p>
{%- endif %}

</div>

{% endfor %}
{% endfor %}
{% endfor %}
{% endfor %}
{% endfor %}
{% endfor %}
{% endfor %}

</div>
