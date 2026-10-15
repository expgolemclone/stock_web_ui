#!/usr/bin/env python3
"""Launch a downstream stock_web_ui consumer with real local data sources."""

from __future__ import annotations

import argparse
import importlib
import shutil
import sys
import tempfile
import types
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
    _disable_stock_price_auto_refresh(args.app)

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


def _disable_stock_price_auto_refresh(app: str) -> None:
    module_name_by_app = {
        "formula_screening": "formula_screening.stock_db_compat",
        "invest_like_legends": "stock_db_bridge",
        "land_value_research": "src.stock_db_sync",
    }
    module = importlib.import_module(module_name_by_app[app])
    module.ensure_prices_fresh = lambda: None  # type: ignore[attr-defined]


def _server_config(port: int):
    from stock_web_ui.config import ServerConfig

    return ServerConfig(host="127.0.0.1", port=port)


def _serve_formula_screening(project_dir: Path, port: int) -> None:
    from formula_screening.web import run_screening_strategy_payload, serve_screening_payload
    from formula_screening.stock_db_compat import get_screening_tickers

    strategy_path = project_dir / "strategies" / "net_cash_fcf.toml"
    tickers = get_screening_tickers(limit=20)
    payload = run_screening_strategy_payload(strategy_path, tickers=tickers, return_all=True)

    if not payload:
        raise RuntimeError("formula_screening produced no rows from stock_db Rust CLI")

    serve_screening_payload(payload[:20], server_config=_server_config(port))


def _serve_invest_like_legends(port: int) -> None:
    import serve as app_serve
    from investor_data import (
        build_investors_document,
        build_shareholder_candidates_document,
        build_stock_price_metadata,
        compute_metrics_map,
        load_major_shareholder_rows,
        load_stock_names,
    )
    from stock_web_ui.page import IndexPage

    stock_names = load_stock_names()
    metrics_map = compute_metrics_map()
    shareholder_rows = load_major_shareholder_rows()
    investors_doc = build_investors_document(
        stock_names=stock_names,
        metrics_map=metrics_map,
        shareholder_rows=shareholder_rows,
    )
    candidates_doc = build_shareholder_candidates_document(
        stock_names=stock_names,
        metrics_map=metrics_map,
        shareholder_rows=shareholder_rows,
    )
    metadata = build_stock_price_metadata()
    app_serve._load_and_enrich_investors = lambda: investors_doc
    app_serve._load_shareholder_candidates = lambda: candidates_doc
    app_serve._load_stock_price_metadata = lambda: metadata

    app_serve._serve(
        static_root=app_serve._STATIC_ROOT,
        index_page=IndexPage(
            title="保有銘柄ビューア - 四季報オンラインリンク一覧",
            loading_message="投資家データを読み込み中です。",
            tab_aria_label="投資家切替",
        ),
        server_config=_server_config(port),
        api_routes=app_serve._create_api_routes(
            investors_doc=investors_doc,
            shareholder_candidates_doc=candidates_doc,
            stock_price_metadata=metadata,
        ),
        yazi_base_dir=app_serve._HANDBOOK_DATA_DIR,
    )


def _serve_land_value_research(project_dir: Path, port: int) -> None:
    _ensure_land_value_screening_config_importable()

    from src.web import serve_ranking

    sample_dir = tempfile.TemporaryDirectory(prefix="stock-web-ui-land-output-")
    _copy_sample_outputs(project_dir / "data" / "output", Path(sample_dir.name))
    serve_ranking(input_dir=Path(sample_dir.name), server_config=_server_config(port))


def _ensure_land_value_screening_config_importable() -> None:
    try:
        importlib.import_module("src.screening_config")
        return
    except ModuleNotFoundError as exc:
        if exc.name != "src.screening_config":
            raise

    stub = types.ModuleType("src.screening_config")

    def load_screening_config(_path: object) -> object:
        raise RuntimeError("screening_config is unavailable in the downstream UI smoke test")

    stub.load_screening_config = load_screening_config  # type: ignore[attr-defined]
    sys.modules["src.screening_config"] = stub


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
