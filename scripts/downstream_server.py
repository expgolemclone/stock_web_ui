#!/usr/bin/env python3
"""Launch a downstream stock_web_ui consumer with real local data sources."""

from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", choices=("formula_screening", "invest_like_legends", "land_value_research"), required=True)
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    project_dir = Path.cwd()
    if str(project_dir) not in sys.path:
        sys.path.insert(0, str(project_dir))

    _disable_browser_startup()

    if args.app == "formula_screening":
        _serve_formula_screening(project_dir, args.port)
    elif args.app == "invest_like_legends":
        _serve_invest_like_legends(args.port)
    else:
        _serve_land_value_research(project_dir, args.port)


def _disable_browser_startup() -> None:
    import stock_web_ui.serve as serve_mod

    serve_mod._open_startup_browser = lambda _url: None  # type: ignore[attr-defined]
    serve_mod._release_port_if_needed = lambda _host, _port: None  # type: ignore[attr-defined]


def _server_config(port: int):
    from stock_web_ui.config import ServerConfig

    return ServerConfig(host="127.0.0.1", port=port)


def _serve_formula_screening(project_dir: Path, port: int) -> None:
    from formula_screening.screener import run_screening
    from formula_screening.web import serve_screening
    from stock_db.paths import STOCKS_DB_PATH
    from stock_db.storage.connection import get_connection

    strategy_path = project_dir / "strategies" / "net_cash_fcf.py"
    tickers = _sample_tickers(STOCKS_DB_PATH)
    with get_connection(STOCKS_DB_PATH) as conn:
        stocks = run_screening(conn, strategy_path, workers=1, tickers=tickers, return_all=True)

    if not stocks:
        raise RuntimeError(f"formula_screening produced no rows from {STOCKS_DB_PATH}")

    serve_screening(stocks[:20], server_config=_server_config(port))


def _sample_tickers(db_path: Path, limit: int = 20) -> list[str]:
    query = """
        SELECT s.ticker
        FROM stocks AS s
        WHERE EXISTS (SELECT 1 FROM prices AS p WHERE p.ticker = s.ticker)
          AND EXISTS (SELECT 1 FROM financial_items AS f WHERE f.ticker = s.ticker)
        ORDER BY s.ticker
        LIMIT ?
    """
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(query, (limit,)).fetchall()
    tickers = [str(row[0]) for row in rows]
    if not tickers:
        raise RuntimeError(f"no ticker with price and financial data in {db_path}")
    return tickers


def _serve_invest_like_legends(port: int) -> None:
    import serve as app_serve
    from stock_web_ui.page import IndexPage

    app_serve._serve(
        static_root=app_serve._STATIC_ROOT,
        index_page=IndexPage(
            title="保有銘柄ビューア - 四季報オンラインリンク一覧",
            loading_message="投資家データを読み込み中です。",
            tab_aria_label="投資家切替",
        ),
        server_config=_server_config(port),
        api_routes=app_serve._create_api_routes(),
        yazi_base_dir=app_serve._HANDBOOK_DATA_DIR,
    )


def _serve_land_value_research(project_dir: Path, port: int) -> None:
    from src.web import serve_ranking

    sample_dir = tempfile.TemporaryDirectory(prefix="stock-web-ui-land-output-")
    _copy_sample_outputs(project_dir / "data" / "output", Path(sample_dir.name))
    serve_ranking(input_dir=Path(sample_dir.name), server_config=_server_config(port))


def _copy_sample_outputs(source_dir: Path, target_dir: Path, limit: int = 8) -> None:
    if not source_dir.is_dir():
        raise RuntimeError(f"land_value_research output dir is missing: {source_dir}")
    target_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    for source in sorted(source_dir.glob("*_output.csv")):
        shutil.copy2(source, target_dir / source.name)
        copied += 1
        if copied >= limit:
            break
    if copied == 0:
        raise RuntimeError(f"no *_output.csv files in {source_dir}")


if __name__ == "__main__":
    main()
