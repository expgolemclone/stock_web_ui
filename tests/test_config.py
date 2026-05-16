"""Tests for stock_web_ui config loading."""

from __future__ import annotations

from pathlib import Path

import stock_web_ui.config as config_mod


def test_load_server_config_reads_config_dir(monkeypatch, tmp_path: Path) -> None:
    (tmp_path / "cli_defaults.toml").write_text(
        "[server]\nhost = \"127.0.0.1\"\nport = 9999\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(config_mod, "CONFIG_DIR", tmp_path)

    config = config_mod.load_server_config()

    assert config.host == "127.0.0.1"
    assert config.port == 9999


def test_load_browser_config_reads_config_dir(monkeypatch, tmp_path: Path) -> None:
    (tmp_path / "magic_numbers.toml").write_text(
        "\n".join(
            [
                "[browsers]",
                "shikiho = \"google-chrome\"",
                "monex = \"firefox\"",
                "",
                "[allowed_url_prefixes]",
                "shikiho = \"https://shikiho.example/\"",
                "monex = \"https://monex.example/\"",
            ]
        ) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(config_mod, "CONFIG_DIR", tmp_path)

    config = config_mod.load_browser_config()

    assert config.entries["shikiho"].command == "google-chrome"
    assert config.entries["shikiho"].allowed_url_prefix == "https://shikiho.example/"
    assert config.entries["monex"].command == "firefox"
    assert config.entries["monex"].allowed_url_prefix == "https://monex.example/"


def test_load_yazi_config_reads_cli_defaults(monkeypatch, tmp_path: Path) -> None:
    (tmp_path / "cli_defaults.toml").write_text(
        "\n".join(
            [
                "[server]",
                "host = \"127.0.0.1\"",
                "port = 9999",
                "",
                "[yazi]",
                "base_dir = \"~/handbook/data\"",
            ]
        ) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(config_mod, "CONFIG_DIR", tmp_path)
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("STOCK_WEB_UI_YAZI_BASE_DIR", raising=False)

    config = config_mod.load_yazi_config()

    assert config.base_dir == tmp_path / "handbook" / "data"


def test_load_yazi_config_prefers_environment(monkeypatch, tmp_path: Path) -> None:
    (tmp_path / "cli_defaults.toml").write_text(
        "\n".join(
            [
                "[server]",
                "host = \"127.0.0.1\"",
                "port = 9999",
                "",
                "[yazi]",
                "base_dir = \"/from/toml\"",
            ]
        ) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(config_mod, "CONFIG_DIR", tmp_path)
    monkeypatch.setenv("STOCK_WEB_UI_YAZI_BASE_DIR", str(tmp_path / "from-env"))

    config = config_mod.load_yazi_config()

    assert config.base_dir == tmp_path / "from-env"


def test_load_yazi_config_empty_environment_disables_integration(monkeypatch, tmp_path: Path) -> None:
    (tmp_path / "cli_defaults.toml").write_text(
        "\n".join(
            [
                "[server]",
                "host = \"127.0.0.1\"",
                "port = 9999",
                "",
                "[yazi]",
                "base_dir = \"/from/toml\"",
            ]
        ) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(config_mod, "CONFIG_DIR", tmp_path)
    monkeypatch.setenv("STOCK_WEB_UI_YAZI_BASE_DIR", "  ")

    config = config_mod.load_yazi_config()

    assert config.base_dir is None


def test_load_yazi_config_allows_missing_yazi_section(monkeypatch, tmp_path: Path) -> None:
    (tmp_path / "cli_defaults.toml").write_text(
        "[server]\nhost = \"127.0.0.1\"\nport = 9999\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(config_mod, "CONFIG_DIR", tmp_path)
    monkeypatch.delenv("STOCK_WEB_UI_YAZI_BASE_DIR", raising=False)

    config = config_mod.load_yazi_config()

    assert config.base_dir is None
