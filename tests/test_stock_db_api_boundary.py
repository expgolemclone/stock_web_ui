from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_downstream_checks_use_stock_db_public_api() -> None:
    banned_tokens = (
        "sqlite3",
        "stock_db.paths",
        "stock_db.storage",
        "STOCKS_DB_PATH",
        "get_connection(",
    )
    checked_paths = (
        ROOT / "scripts" / "downstream_server.py",
        ROOT / "scripts" / "check_downstream_ui.mjs",
    )

    offenders: list[str] = []
    for path in checked_paths:
        text = path.read_text(encoding="utf-8")
        for token in banned_tokens:
            if token in text:
                offenders.append(f"{path.relative_to(ROOT)} contains {token}")

    assert offenders == []
