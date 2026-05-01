"""Common HTML page rendering for stock_web_ui consumers."""

from __future__ import annotations

from dataclasses import dataclass
from html import escape

from stock_web_ui import INDEX_TEMPLATE_PATH


@dataclass(frozen=True, slots=True)
class IndexPage:
    title: str
    loading_message: str = "データを読み込み中です。"
    tab_aria_label: str = "タブ切替"
    asset_version: str = ""


def render_index_html(page: IndexPage) -> bytes:
    template: str = INDEX_TEMPLATE_PATH.read_text(encoding="utf-8")
    asset_version_suffix: str = f"?v={escape(page.asset_version, quote=True)}" if page.asset_version else ""
    rendered: str = (
        template
        .replace("{{TITLE}}", escape(page.title, quote=True))
        .replace("{{STATUS_MESSAGE}}", escape(page.loading_message, quote=True))
        .replace("{{TAB_ARIA_LABEL}}", escape(page.tab_aria_label, quote=True))
        .replace("{{ASSET_VERSION_SUFFIX}}", asset_version_suffix)
    )
    return rendered.encode("utf-8")
