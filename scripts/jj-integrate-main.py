#!/usr/bin/env python3
"""Integrate the current jj change into main and push main."""

from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str]) -> None:
    print("+ " + " ".join(command), flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> None:
    run(["jj", "rebase", "-d", "main"])
    run(["jj", "bookmark", "set", "main", "-r", "@"])
    run(["jj", "git", "push", "--bookmark", "main"])


if __name__ == "__main__":
    main()
