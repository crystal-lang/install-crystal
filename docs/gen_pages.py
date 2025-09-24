import subprocess

import mkdocs_gen_files
import jinja2


with mkdocs_gen_files.open("assets/style.css", "a") as f:
    f.write(
        "\n"
        + ",\n".join(
            f".configurator > input:nth-of-type({i}):checked ~ div:not(.c{i}), "
            f".configurator > input:nth-of-type({i}):not(:checked) ~ div.c{i}"
            for i in range(1, 10)
        )
        + " {\n    display: none;\n}\n"
    )

with mkdocs_gen_files.open("configurator.md", "r") as f:
    content = f.read()
content = jinja2.Template(content).render(
    latest_rev=subprocess.check_output("git rev-parse v1".split(), encoding="utf-8").strip(),
    latest_tag=subprocess.check_output("git describe --exact-match v1".split(), encoding="utf-8").strip(),
)
with mkdocs_gen_files.open("configurator.md", "w") as f:
    f.write(content)

mkdocs_gen_files.set_edit_path("configurator.md", "configurator.md")
mkdocs_gen_files.set_edit_path("index.md", "../README.md")
