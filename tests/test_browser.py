"""Tests for browser launching helpers."""

from __future__ import annotations

import subprocess

import stock_web_ui.browser as browser_mod
from stock_web_ui.config import BrowserConfig, BrowserEntry


def test_open_in_browser_rejects_unknown_browser_key() -> None:
    config = BrowserConfig(entries={})

    result = browser_mod.open_in_browser(config, "monex", "https://example.com/report")

    assert result.success is False
    assert result.message == "Unknown browser key: monex"


def test_open_in_browser_rejects_disallowed_url_prefix() -> None:
    config = BrowserConfig(entries={"monex": BrowserEntry(command="google-chrome", allowed_url_prefix="https://example.com/")})

    result = browser_mod.open_in_browser(config, "monex", "https://invalid.example/report")

    assert result.success is False
    assert result.message == "URL not allowed for monex: https://invalid.example/report"


def test_open_in_browser_launches_allowed_url(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_popen(command: list[str], stdout: int, stderr: int) -> object:
        calls.append({"command": command, "stdout": stdout, "stderr": stderr})
        return object()

    monkeypatch.setattr(browser_mod.subprocess, "Popen", fake_popen)
    config = BrowserConfig(entries={"shikiho": BrowserEntry(command="google-chrome", allowed_url_prefix="https://example.com/")})

    result = browser_mod.open_in_browser(config, "shikiho", "https://example.com/report")

    assert result.success is True
    assert result.message == "Opened in google-chrome"
    assert calls == [
        {
            "command": ["google-chrome", "https://example.com/report"],
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
        }
    ]
