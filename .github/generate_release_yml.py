from pathlib import Path

content = Path(".github/workflows/main.yml").read_text()
content = (
    content.replace(
        "name: CI",
        "name: CI (release)",
    )
    .replace(
        "  pull_request:\n    paths-ignore: ['docs/**', '*.md']",
        "\n",
    )
    .replace(
        "branches: [master]",
        "branches: [v1]",
    )
    .replace(
        "cron: '0 6 * * 6'",
        "cron: '0 6 * * *'",
    )
    .replace(
        "      - run: npm install --only=prod",
        "",
    )
    .replace(
        "      - uses: ./",
        "      - uses: crystal-lang/install-crystal@v1",
    )
)
Path(".github/workflows/release.yml").write_text(content)
