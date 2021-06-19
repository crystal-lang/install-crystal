import mkdocs_gen_files

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
