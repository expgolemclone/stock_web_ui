"""CLI to render a project-specific index.html from the shared template."""

from __future__ import annotations

import argparse
from pathlib import Path

from stock_web_ui.page import IndexPage, render_index_html


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--title", required=True)
    parser.add_argument("--loading-message", default="データを読み込み中です。")
    parser.add_argument("--tab-aria-label", default="タブ切替")
    parser.add_argument("--asset-version", default="")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    output_path: Path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(
        render_index_html(
            IndexPage(
                title=args.title,
                loading_message=args.loading_message,
                tab_aria_label=args.tab_aria_label,
                asset_version=args.asset_version,
            )
        )
    )


if __name__ == "__main__":
    main()
