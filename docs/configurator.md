# Quick start for [install-crystal](https://github.com/oprypin/install-crystal/) GitHub Action

Set up your Crystal project on GitHub for continuous testing.
<div class="configurator">
<hr>
<strong>I am developing</strong>
<input type="radio" name="software-kind" id="software-kind-app"><label for="software-kind-app"><strong>an application</strong></label>
<input type="radio" name="software-kind" id="software-kind-lib"><label for="software-kind-lib"><strong>a library</strong> (also track updates of deps).</label>
<hr>
<span>I want to support <label>Linux,</label></span>
<input type="checkbox" id="os-mac"><label for="os-mac">macOS,</label>
<input type="checkbox" id="os-win"><label for="os-win">Windows.</label>
<br>
<span>I want to support <label>latest Crystal,</label></span>
<input type="checkbox" id="crystal-ver"><label for="crystal-ver">a particular older version</label>
<input type="checkbox" id="crystal-nightly"><label for="crystal-nightly">and follow Crystal <abbr title="Unreleased builds from the latest commit on master">nightlies</abbr>.</label>
<br>
<input type="checkbox" id="tool-format"><label for="tool-format">I format code with <code>crystal tool format</code>.</label>
<br>
<input type="checkbox" id="cache-shards"><label for="cache-shards">Cache dependencies (worth only if there are many).</label>
<hr>

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
    {%- set unroll = os_win or (crystal_ver and crystal_nightly and os_mac) %}
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
    {%- if os_win and cache_shards and is_app %}
    defaults:
      run:
        shell: bash
    {%- endif %}
    steps:
      - name: Download source
        uses: actions/checkout@v2
      - name: Install Crystal
        uses: oprypin/install-crystal@v1
        {%- if crystal_nightly or crystal_ver %}
        with:
          crystal: {{ "${{ matrix.crystal }}" }}
        {%- endif %}
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
      - name: Install shards
        {%- if is_app %}
        run: {% if cache_shards %}shards check || {% endif %}shards install --ignore-crystal-version
        {%- else %}
        run: shards update --ignore-crystal-version
        {%- endif %}
      - name: Run tests
        run: crystal spec --order=random
      {%- if is_app %}
      - name: Build
        run: shards build
      {%- endif %}
      {%- if tool_format %}
      - name: Check formatting
        run: crystal tool format{% if is_app %}; git diff --exit-code{% else %} --check{% endif %}
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

<div class="configurator">
<input type="checkbox" id="fixed-ref"><label for="fixed-ref">I don't <a target="_blank" href="https://docs.github.com/en/actions/learn-github-actions/security-hardening-for-github-actions#using-third-party-actions">trust</a> a third-party action</label>.

<div class="c1">
Copy the commit hash of the latest <a target="_blank" href="https://github.com/oprypin/install-crystal/tags">release</a> instead of the "v1" part in <code>oprypin/install-crystal@<strong>v1</strong></code>.
</div>
</div>

<script>
var fixedRef = document.getElementById('fixed-ref');

function fixedRefChange() {
    var codes = document.querySelectorAll('.configurator .hljs-string');
    var rev = fixedRef.checked ? '{{ latest_rev }}' : 'v1';
    for (var i = 0; i < codes.length; ++i) {
        if (codes[i].innerHTML.includes('install-crystal')) {
            codes[i].innerHTML = codes[i].innerHTML.replace(/@\w+/g, '@' + rev);
        }
    }
}

if (fixedRef) {
    document.addEventListener('DOMContentLoaded', fixedRefChange);
    fixedRef.addEventListener('change', fixedRefChange);
}
</script>
