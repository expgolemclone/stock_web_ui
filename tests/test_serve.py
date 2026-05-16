"""Tests for stock_web_ui serve module (port-release logic)."""

from __future__ import annotations

import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import stock_web_ui.serve as serve_mod
from stock_web_ui.config import BrowserConfig, ServerConfig, YaziConfig
from stock_web_ui.page import IndexPage


pytestmark = pytest.mark.skipif(not Path("/proc").exists(), reason="/proc is required")


class _StopServer(Exception):
    pass


class _FakeHTTPServer:
    def __init__(self, address: tuple[str, int], handler_cls: object) -> None:
        self.address = address
        self.handler_cls = handler_cls

    def serve_forever(self) -> None:
        raise _StopServer


def test_serve_uses_configured_yazi_base_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    configured_base_dir: Path = tmp_path / "configured-handbook"
    _install_fake_server(monkeypatch)
    monkeypatch.setattr(serve_mod, "load_yazi_config", lambda: YaziConfig(base_dir=configured_base_dir))

    with pytest.raises(_StopServer):
        serve_mod.serve(
            static_root=tmp_path,
            index_page=IndexPage(title="Test"),
            browser_config=BrowserConfig(entries={}),
            server_config=ServerConfig(host="127.0.0.1", port=0),
        )

    assert serve_mod.RequestHandler.route_config.yazi_base_dir == configured_base_dir


def test_serve_yazi_argument_overrides_config(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    explicit_base_dir: Path = tmp_path / "explicit-handbook"
    _install_fake_server(monkeypatch)

    def fail_load_yazi_config() -> YaziConfig:
        raise AssertionError("load_yazi_config should not be called when yazi_base_dir is explicit")

    monkeypatch.setattr(serve_mod, "load_yazi_config", fail_load_yazi_config)

    with pytest.raises(_StopServer):
        serve_mod.serve(
            static_root=tmp_path,
            index_page=IndexPage(title="Test"),
            browser_config=BrowserConfig(entries={}),
            server_config=ServerConfig(host="127.0.0.1", port=0),
            yazi_base_dir=explicit_base_dir,
        )

    assert serve_mod.RequestHandler.route_config.yazi_base_dir == explicit_base_dir


def test_find_listening_pids_detects_listener() -> None:
    port: int = _reserve_free_port()
    proc: subprocess.Popen[bytes] = _spawn_listener(port)

    try:
        pids: list[int] = _wait_for_listening_pids(port, proc.pid)
        assert proc.pid in pids
    finally:
        _stop_process(proc)


def test_release_port_if_needed_terminates_listener(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(serve_mod, "_TERM_TIMEOUT_SECONDS", 0.2)
    monkeypatch.setattr(serve_mod, "_POLL_INTERVAL_SECONDS", 0.02)

    port: int = _reserve_free_port()
    proc: subprocess.Popen[bytes] = _spawn_listener(port)

    try:
        _wait_for_listening_pids(port, proc.pid)
        serve_mod._release_port_if_needed("127.0.0.1", port)
        proc.wait(timeout=5)
        assert proc.returncode is not None
        assert serve_mod._find_listening_pids(port) == []
    finally:
        _stop_process(proc)


def test_release_port_if_needed_force_kills_stubborn_listener(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(serve_mod, "_TERM_TIMEOUT_SECONDS", 0.2)
    monkeypatch.setattr(serve_mod, "_POLL_INTERVAL_SECONDS", 0.02)

    port: int = _reserve_free_port()
    proc: subprocess.Popen[bytes] = _spawn_listener(port, ignore_sigterm=True)

    try:
        _wait_for_listening_pids(port, proc.pid)
        serve_mod._release_port_if_needed("127.0.0.1", port)
        proc.wait(timeout=5)
        assert proc.returncode == -9
        assert serve_mod._find_listening_pids(port) == []
    finally:
        _stop_process(proc)


def test_open_startup_browser_launches_xdg_open(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_popen(
        command: list[str],
        stdin: int,
        stdout: int,
        stderr: int,
        start_new_session: bool,
    ) -> object:
        calls.append(
            {
                "command": command,
                "stdin": stdin,
                "stdout": stdout,
                "stderr": stderr,
                "start_new_session": start_new_session,
            }
        )
        return object()

    monkeypatch.setattr(serve_mod.subprocess, "Popen", fake_popen)

    serve_mod._open_startup_browser("http://127.0.0.1:8080")

    assert calls == [
        {
            "command": ["xdg-open", "http://127.0.0.1:8080"],
            "stdin": subprocess.DEVNULL,
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
            "start_new_session": True,
        }
    ]


def test_open_startup_browser_skips_missing_xdg_open(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str],
) -> None:
    def fake_popen(
        command: list[str],
        stdin: int,
        stdout: int,
        stderr: int,
        start_new_session: bool,
    ) -> object:
        raise FileNotFoundError(command[0])

    monkeypatch.setattr(serve_mod.subprocess, "Popen", fake_popen)

    serve_mod._open_startup_browser("http://127.0.0.1:8080")

    captured = capsys.readouterr()
    assert "xdg-open" in captured.out
    assert "http://127.0.0.1:8080" in captured.out


def _install_fake_server(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(serve_mod, "HTTPServer", _FakeHTTPServer)
    monkeypatch.setattr(serve_mod, "_release_port_if_needed", lambda host, port: None)
    monkeypatch.setattr(serve_mod, "_open_startup_browser", lambda url: None)


def _reserve_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _spawn_listener(port: int, ignore_sigterm: bool = False) -> subprocess.Popen[bytes]:
    signal_setup: str = ""
    if ignore_sigterm:
        signal_setup = "import signal; signal.signal(signal.SIGTERM, lambda *_: None);"

    code: str = (
        f"{signal_setup}"
        "from http.server import HTTPServer, SimpleHTTPRequestHandler;"
        f"HTTPServer(('127.0.0.1', {port}), SimpleHTTPRequestHandler).serve_forever()"
    )
    return subprocess.Popen(
        [sys.executable, "-c", code],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _wait_for_listening_pids(port: int, expected_pid: int, timeout: float = 5.0) -> list[int]:
    deadline: float = time.monotonic() + timeout
    while time.monotonic() < deadline:
        pids: list[int] = serve_mod._find_listening_pids(port)
        if expected_pid in pids:
            return pids
        time.sleep(0.05)

    raise AssertionError(f"PID {expected_pid} did not start listening on port {port}")


def _stop_process(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is not None:
        return

    proc.terminate()
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=2)
