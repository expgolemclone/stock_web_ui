"""Tests for shared index template rendering."""

from __future__ import annotations

from stock_web_ui.page import IndexPage, render_index_html


def test_render_index_html_replaces_placeholders_and_escapes_values() -> None:
    html = render_index_html(
        IndexPage(
            title="A&B",
            loading_message="読み込み <中>",
            tab_aria_label="投資家 & タブ",
            asset_version="20260501",
        )
    ).decode("utf-8")

    assert "<title>A&amp;B</title>" in html
    assert "読み込み &lt;中&gt;" in html
    assert 'aria-label="投資家 &amp; タブ"' in html
    assert "assets/stock-table.js?v=20260501" in html
