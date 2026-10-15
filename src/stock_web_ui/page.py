"""Common HTML page rendering for stock_web_ui consumers."""

from __future__ import annotations

from dataclasses import dataclass

from stock_web_ui import ASSETS_DIR, INDEX_TEMPLATE_PATH
from stock_web_ui._core import render_index_html as _rust_render

_CHART_JS_CDN = "https://cdn.jsdelivr.net/npm/chart.js"


@dataclass(frozen=True, slots=True)
class IndexPage:
    title: str
    loading_message: str = "データを読み込み中です。"
    tab_aria_label: str = "タブ切替"
    asset_version: str = ""
    shared_asset_base_url: str = ""
    chart_js_url: str = _CHART_JS_CDN


def render_index_html(page: IndexPage) -> bytes:
    template: str = INDEX_TEMPLATE_PATH.read_text(encoding="utf-8")
    return _rust_render(
        template=template,
        title=page.title,
        loading_message=page.loading_message,
        tab_aria_label=page.tab_aria_label,
        asset_version=page.asset_version,
        shared_asset_base_url=page.shared_asset_base_url,
        shared_assets_root=str(ASSETS_DIR),
    )
