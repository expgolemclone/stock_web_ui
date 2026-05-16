#!/usr/bin/env python3
"""Claude Code Stop hook wrapper for the shared downstream UI check."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def main() -> None:
    project_dir = Path(
        os.environ.get("CLAUDE_PROJECT_DIR")
        or Path(__file__).resolve().parents[2]
    )
    if os.environ.get("STOCK_WEB_UI_SKIP_DOWNSTREAM_UI_CHECK") == "1":
        print("stock_web_ui downstream UI check skipped by STOCK_WEB_UI_SKIP_DOWNSTREAM_UI_CHECK=1")
        return

    result = subprocess.run(
        ["npm", "run", "check:downstream-ui"],
        cwd=project_dir,
        text=True,
    )
    if result.returncode != 0:
        sys.exit(result.returncode)


if __name__ == "__main__":
    main()
