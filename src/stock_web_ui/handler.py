"""Generic HTTP request handler for stock web UI."""

from __future__ import annotations

import json
import mimetypes
import subprocess
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import ClassVar
from urllib.parse import parse_qs, urlparse

from stock_web_ui.browser import OpenResult, open_in_browser
from stock_web_ui.config import BrowserConfig

_MIME_OVERRIDES: dict[str, str] = {
    ".js": "application/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".pdf": "application/pdf",
}

ApiHandler = Callable[[BaseHTTPRequestHandler, dict[str, list[str]]], None]


class RouteConfig:
    """Immutable configuration for request routing."""

    __slots__ = ("static_root", "index_path", "browser_config", "api_routes", "yazi_base_dir", "extra_static_roots")

    def __init__(
        self,
        *,
        static_root: Path,
        index_path: Path,
        browser_config: BrowserConfig,
        api_routes: dict[str, ApiHandler] | None = None,
        yazi_base_dir: Path | None = None,
        extra_static_roots: list[Path] | None = None,
    ) -> None:
        self.static_root = static_root
        self.index_path = index_path
        self.browser_config = browser_config
        self.api_routes: dict[str, ApiHandler] = api_routes or {}
        self.yazi_base_dir = yazi_base_dir
        self.extra_static_roots: list[Path] = extra_static_roots or []


class RequestHandler(BaseHTTPRequestHandler):
    """HTTP handler that dispatches to registered API routes and serves static files."""

    route_config: ClassVar[RouteConfig]

    def do_GET(self) -> None:
        parsed_url: str = urlparse(self.path).path

        if parsed_url == "/open":
            self._handle_open()
        elif parsed_url.startswith("/open-yazi/"):
            code: str = parsed_url[len("/open-yazi/"):]
            self._handle_open_yazi(code)
        elif parsed_url.startswith("/api/"):
            handler = self.route_config.api_routes.get(parsed_url)
            if handler is not None:
                query_params: dict[str, list[str]] = parse_qs(urlparse(self.path).query)
                handler(self, query_params)
            else:
                self._send_json_response(404, {"error": "Not found"})
        elif parsed_url == "/":
            self._serve_file(self.route_config.index_path, "text/html")
        elif parsed_url.startswith("/assets/"):
            self._serve_asset(parsed_url)
        else:
            self._send_json_response(404, {"error": "Not found"})

    def _handle_open(self) -> None:
        query_params: dict[str, list[str]] = parse_qs(urlparse(self.path).query)
        browser_keys: list[str] = query_params.get("browser", [])
        urls: list[str] = query_params.get("url", [])

        if not browser_keys or not urls:
            self._send_json_response(400, {"error": "Missing browser or url parameter"})
            return

        result: OpenResult = open_in_browser(
            self.route_config.browser_config, browser_keys[0], urls[0],
        )
        status_code: int = 200 if result.success else 400
        self._send_json_response(status_code, {"success": result.success, "message": result.message})

    def _handle_open_yazi(self, code: str) -> None:
        base_dir = self.route_config.yazi_base_dir
        if base_dir is None:
            self._send_json_response(404, {"error": "Yazi integration not configured"})
            return

        latest_dir: Path | None = _find_latest_quarter(base_dir)
        if latest_dir is None:
            self._send_json_response(404, {"error": "Handbook data not found"})
            return

        pdf_path: Path = latest_dir / f"{code}.pdf"
        if not pdf_path.is_file():
            self._send_json_response(404, {"error": f"PDF not found: {code}"})
            return

        subprocess.Popen(
            ["kitty", "-e", "yazi", str(pdf_path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self._send_json_response(200, {"success": True, "message": f"Opened in yazi: {code}"})

    def _serve_asset(self, parsed_url: str) -> None:
        filename: str = parsed_url[len("/assets/"):]
        static_root: Path = self.route_config.static_root
        file_path: Path = static_root / filename
        if not file_path.is_file():
            self._send_json_response(404, {"error": "Not found"})
            return
        allowed_roots: list[Path] = [static_root.resolve()] + [
            r.resolve() for r in self.route_config.extra_static_roots
        ]
        resolved: Path = file_path.resolve()
        if any(root in resolved.parents for root in allowed_roots):
            content_type: str = _resolve_mime(file_path)
            self._serve_file(file_path, content_type)
        else:
            self._send_json_response(403, {"error": "Forbidden"})

    def _serve_file(self, path: Path, content_type: str) -> None:
        content: bytes = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _send_json_response(self, status_code: int, body: dict[str, str | bool]) -> None:
        payload: bytes = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args: str | int) -> None:
        print(f"[server] {args[0]} {args[1]}")


def _resolve_mime(path: Path) -> str:
    suffix: str = path.suffix.lower()
    if suffix in _MIME_OVERRIDES:
        return _MIME_OVERRIDES[suffix]
    guessed: str | None = mimetypes.guess_type(str(path))[0]
    return guessed or "application/octet-stream"


def _find_latest_quarter(base_dir: Path) -> Path | None:
    if not base_dir.is_dir():
        return None
    quarters: list[str] = sorted(
        p.name for p in base_dir.iterdir()
        if p.is_dir() and len(p.name) == 6 and p.name[4] == "_"
    )
    return base_dir / quarters[-1] if quarters else None
