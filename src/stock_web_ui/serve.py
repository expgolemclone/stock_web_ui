"""HTTP server launcher with port-release and browser-startup logic."""

from __future__ import annotations

import os
import platform
import signal
import subprocess
import time
from http.server import HTTPServer
from pathlib import Path

from stock_web_ui.config import BrowserConfig, ServerConfig, load_server_config
from stock_web_ui.handler import RequestHandler, RouteConfig

_IS_WINDOWS: bool = platform.system() == "Windows"
_LISTEN_STATE: str = "0A"
_PROC_PATH: Path = Path("/proc")
_TERM_TIMEOUT_SECONDS: float = 1.0
_POLL_INTERVAL_SECONDS: float = 0.1
_STARTUP_BROWSER_COMMAND: str = "google-chrome"


def serve(
    *,
    static_root: Path,
    index_path: Path,
    browser_config: BrowserConfig | None = None,
    server_config: ServerConfig | None = None,
    api_routes: dict | None = None,
    yazi_base_dir: Path | None = None,
) -> None:
    """Start the HTTP server and open a browser.

    Args:
        static_root: Directory containing /assets/ files.
        index_path: Path to index.html.
        browser_config: Browser config (loads default if omitted).
        server_config: Server host/port (loads default if omitted).
        api_routes: Dict mapping "/api/..." paths to handler callables.
        yazi_base_dir: Base directory for yazi PDF integration (optional).
    """
    if server_config is None:
        server_config = load_server_config()
    if browser_config is None:
        from stock_web_ui.config import load_browser_config
        browser_config = load_browser_config()

    RequestHandler.route_config = RouteConfig(
        static_root=static_root,
        index_path=index_path,
        browser_config=browser_config,
        api_routes=api_routes or {},
        yazi_base_dir=yazi_base_dir,
    )

    _release_port_if_needed(server_config.host, server_config.port)
    address: tuple[str, int] = (server_config.host, server_config.port)
    httpd: HTTPServer = HTTPServer(address, RequestHandler)
    server_url: str = f"http://{server_config.host}:{server_config.port}"
    print(f"Serving on {server_url}")
    _open_startup_browser(server_url)
    httpd.serve_forever()


def _release_port_if_needed(host: str, port: int) -> None:
    if _IS_WINDOWS:
        pids: list[int] = _find_listening_pids_windows(port)
    else:
        pids: list[int] = _find_listening_pids(port)

    if not pids:
        return

    print(f"Port {host}:{port} is in use; stopping PIDs {pids}")
    _signal_pids(pids, signal.SIGTERM)
    if _wait_for_port_release(port):
        print(f"Released port {host}:{port}")
        return

    if _IS_WINDOWS:
        remaining_pids: list[int] = _find_listening_pids_windows(port)
    else:
        remaining_pids: list[int] = _find_listening_pids(port)

    if remaining_pids:
        if _IS_WINDOWS:
            raise RuntimeError(
                f"Port {host}:{port} is still in use after SIGTERM; "
                f"remaining PIDs {remaining_pids}"
            )
        print(f"Port {host}:{port} is still in use; force killing PIDs {remaining_pids}")
        _signal_pids(remaining_pids, signal.SIGKILL)

    if _wait_for_port_release(port):
        print(f"Released port {host}:{port}")
        return

    raise RuntimeError(f"Failed to release TCP port {host}:{port}")


def _find_listening_pids(port: int) -> list[int]:
    socket_inodes: set[str] = _find_listening_socket_inodes(port)
    if not socket_inodes:
        return []
    return _find_pids_by_socket_inodes(socket_inodes)


def _find_listening_pids_windows(port: int) -> list[int]:
    try:
        result: subprocess.CompletedProcess[bytes] = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True,
            timeout=5,
            check=True,
        )
        output: str = result.stdout.decode("utf-8", errors="ignore")
        pids: set[int] = set()
        for line in output.splitlines():
            parts: list[str] = line.split()
            if len(parts) < 5 and parts[0] == "TCP":
                continue
            if len(parts) < 5:
                continue
            local_address: str = parts[1]
            state: str = parts[3]
            if state != "LISTENING":
                continue
            if local_address.endswith(f":{port}"):
                pid_str: str = parts[4]
                try:
                    pid: int = int(pid_str)
                except ValueError:
                    continue
                if pid == 0:
                    continue
                pids.add(pid)
        return sorted(pids)
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as exc:
        print(f"Failed to find listening PIDs on port {port}: {exc}")
        return []


def _find_listening_socket_inodes(port: int) -> set[str]:
    if not _PROC_PATH.exists():
        raise RuntimeError("Cannot inspect listening sockets because /proc is not available")

    target_port_hex: str = f"{port:04X}"
    socket_inodes: set[str] = set()

    for tcp_path in (_PROC_PATH / "net" / "tcp", _PROC_PATH / "net" / "tcp6"):
        if not tcp_path.exists():
            continue

        with tcp_path.open("r", encoding="utf-8") as f:
            next(f, None)
            for line in f:
                fields: list[str] = line.split()
                if len(fields) < 10:
                    continue

                local_address: str = fields[1]
                state: str = fields[3]
                inode: str = fields[9]
                _, local_port_hex = local_address.rsplit(":", 1)
                if local_port_hex.upper() == target_port_hex and state == _LISTEN_STATE:
                    socket_inodes.add(inode)

    return socket_inodes


def _find_pids_by_socket_inodes(socket_inodes: set[str]) -> list[int]:
    pids: set[int] = set()

    for proc_dir in _PROC_PATH.iterdir():
        if not proc_dir.name.isdigit():
            continue

        fd_dir: Path = proc_dir / "fd"
        try:
            for fd_path in fd_dir.iterdir():
                try:
                    target: str = os.readlink(fd_path)
                except OSError:
                    continue

                inode: str | None = _extract_socket_inode(target)
                if inode in socket_inodes:
                    pids.add(int(proc_dir.name))
                    break
        except (FileNotFoundError, NotADirectoryError, PermissionError):
            continue

    return sorted(pids)


def _extract_socket_inode(target: str) -> str | None:
    prefix: str = "socket:["
    if not target.startswith(prefix) or not target.endswith("]"):
        return None
    return target[len(prefix):-1]


def _signal_pids(pids: list[int], sig: signal.Signals) -> None:
    for pid in pids:
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            continue
        except PermissionError as exc:
            raise RuntimeError(f"Permission denied while signaling PID {pid}") from exc


def _wait_for_port_release(port: int) -> bool:
    deadline: float = time.monotonic() + _TERM_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if _IS_WINDOWS:
            if not _find_listening_pids_windows(port):
                return True
        else:
            if not _find_listening_pids(port):
                return True
        time.sleep(_POLL_INTERVAL_SECONDS)

    if _IS_WINDOWS:
        return not _find_listening_pids_windows(port)
    else:
        return not _find_listening_pids(port)


def _open_startup_browser(url: str) -> None:
    try:
        if _IS_WINDOWS:
            os.startfile(url)  # type: ignore[attr-defined]
        else:
            subprocess.Popen(
                [_STARTUP_BROWSER_COMMAND, url],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
    except FileNotFoundError:
        print(
            f"Startup browser '{_STARTUP_BROWSER_COMMAND}' was not found; "
            f"continuing without opening {url}"
        )
    except OSError as exc:
        print(
            f"Failed to launch startup browser '{_STARTUP_BROWSER_COMMAND}': {exc}. "
            f"Continuing without opening {url}"
        )
