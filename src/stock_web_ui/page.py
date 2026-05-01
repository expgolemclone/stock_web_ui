"""Common HTML page rendering for stock_web_ui consumers."""

from __future__ import annotations

from dataclasses import dataclass
from html import escape

from stock_web_ui import INDEX_TEMPLATE_PATH

_LOCAL_SHARED_ASSET_BASE_URL = "assets"
_LOCAL_APP_ASSET_BASE_URL = "assets"


@dataclass(frozen=True, slots=True)
class IndexPage:
    title: str
    loading_message: str = "データを読み込み中です。"
    tab_aria_label: str = "タブ切替"
    asset_version: str = ""
    shared_asset_base_url: str = ""


def render_index_html(page: IndexPage) -> bytes:
    template: str = INDEX_TEMPLATE_PATH.read_text(encoding="utf-8")
    asset_version_suffix: str = f"?v={escape(page.asset_version, quote=True)}" if page.asset_version else ""
    shared_asset_base_url: str = _resolve_shared_asset_base_url(page.shared_asset_base_url)
    shared_style_url: str = _build_asset_url(shared_asset_base_url, "style.css", asset_version_suffix)
    shared_runtime_url: str = _build_asset_url(shared_asset_base_url, "stock-table.js", asset_version_suffix)
    app_script_url: str = _build_asset_url(_LOCAL_APP_ASSET_BASE_URL, "app.js", asset_version_suffix)
    rendered: str = (
        template
        .replace("{{TITLE}}", escape(page.title, quote=True))
        .replace("{{STATUS_MESSAGE}}", escape(page.loading_message, quote=True))
        .replace("{{TAB_ARIA_LABEL}}", escape(page.tab_aria_label, quote=True))
        .replace("{{SHARED_STYLE_URL}}", escape(shared_style_url, quote=True))
        .replace("{{SHARED_RUNTIME_URL}}", escape(shared_runtime_url, quote=True))
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
