import re


def slugify(value: str) -> str:
    """'Light Blue' -> 'light-blue'. Used to build per-color asset
    filenames like tryon-light-blue.png."""
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")
