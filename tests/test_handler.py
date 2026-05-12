"""Tests for stock_web_ui handler helpers."""

from __future__ import annotations

import io
from pathlib import Path

import pytest

import stock_web_ui.handler as handler_mod


class _FakeHandler:
    def __init__(self) -> None:
        self.status_code: int | None = None
        self.headers: list[tuple[str, str]] = []
        self.wfile = io.BytesIO()

    def send_response(self, status_code: int) -> None:
        self.status_code = status_code

    def send_header(self, key: str, value: str) -> None:
        self.headers.append((key, value))

    def end_headers(self) -> None:
        return None


def test_send_json_response_writes_status_headers_and_body() -> None:
    handler = _FakeHandler()

    handler_mod.send_json_response(handler, 201, {"success": True, "message": "ok"})

    assert handler.status_code == 201
    assert ("Content-Type", "application/json; charset=utf-8") in handler.headers
    assert handler.wfile.getvalue() == b'{"success": true, "message": "ok"}'


def test_json_route_serializes_route_result() -> None:
    handler = _FakeHandler()
    route = handler_mod.json_route(lambda params: {"query": params.get("q", [""])[0]})

    route(handler, {"q": ["screening"]})

    assert handler.status_code == 200
    assert handler.wfile.getvalue() == b'{"query": "screening"}'


def test_resolve_asset_path_falls_back_to_package_root_when_symlink_escapes(tmp_path: Path) -> None:
    project_assets = tmp_path / "project-assets"
    package_assets = tmp_path / "package-assets"
    project_assets.mkdir()
    package_assets.mkdir()

    package_file = package_assets / "stock-table.js"
    package_file.write_text("console.log('ok');\n", encoding="utf-8")
    try:
        (project_assets / "stock-table.js").symlink_to(package_file)
    except OSError as exc:
        if getattr(exc, "winerror", None) == 1314:
            pytest.skip("symlink creation requires elevated privileges on this Windows environment")
        raise

    resolved = handler_mod._resolve_asset_path("stock-table.js", [project_assets, package_assets])

    assert resolved == package_file
