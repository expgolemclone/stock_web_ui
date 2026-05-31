"""Common HTML page rendering for stock_web_ui consumers."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from html import escape

from stock_web_ui import ASSETS_DIR, INDEX_TEMPLATE_PATH

_LOCAL_SHARED_ASSET_BASE_URL = "assets"
_LOCAL_APP_ASSET_BASE_URL = "assets"
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
    version: str = page.asset_version or _compute_asset_hash()
    asset_version_suffix: str = f"?v={escape(version, quote=True)}"
    shared_asset_base_url: str = _resolve_shared_asset_base_url(page.shared_asset_base_url)
    shared_style_url: str = _build_asset_url(shared_asset_base_url, "style.css", asset_version_suffix)
    shared_runtime_url: str = _build_asset_url(shared_asset_base_url, "stock-table.js", asset_version_suffix)
    shared_columns_url: str = _build_asset_url(shared_asset_base_url, "columns.js", asset_version_suffix)
    shared_cf_chart_url: str = _build_asset_url(shared_asset_base_url, "cf-chart.js", asset_version_suffix)
    app_script_url: str = _build_asset_url(_LOCAL_APP_ASSET_BASE_URL, "app.js", asset_version_suffix)
    rendered: str = (
        template
        .replace("{{TITLE}}", escape(page.title, quote=True))
        .replace("{{STATUS_MESSAGE}}", escape(page.loading_message, quote=True))
        .replace("{{TAB_ARIA_LABEL}}", escape(page.tab_aria_label, quote=True))
        .replace("{{SHARED_STYLE_URL}}", escape(shared_style_url, quote=True))
        .replace("{{SHARED_RUNTIME_URL}}", escape(shared_runtime_url, quote=True))
        .replace("{{SHARED_COLUMNS_URL}}", escape(shared_columns_url, quote=True))
        .replace("{{CHART_JS_URL}}", escape(page.chart_js_url, quote=True))
        .replace("{{SHARED_CF_CHART_URL}}", escape(shared_cf_chart_url, quote=True))
        .replace("{{APP_SCRIPT_URL}}", escape(app_script_url, quote=True))
    )
    return rendered.encode("utf-8")


def _resolve_shared_asset_base_url(shared_asset_base_url: str) -> str:
    stripped: str = shared_asset_base_url.strip()
    if not stripped:
        return _LOCAL_SHARED_ASSET_BASE_URL
    return stripped.rstrip("/")


def _build_asset_url(base_url: str, filename: str, suffix: str) -> str:
    return f"{base_url}/{filename}{suffix}"


_ASSET_FILES = ("style.css", "stock-table.js", "columns.js", "cf-chart.js")
_cached_hash: str | None = None


def _compute_asset_hash() -> str:
    global _cached_hash
    if _cached_hash is not None:
        return _cached_hash
    h = hashlib.md5()
    for name in _ASSET_FILES:
        path = ASSETS_DIR / name
        if path.is_file():
            h.update(path.read_bytes())
    _cached_hash = h.hexdigest()[:10]
    return _cached_hash
