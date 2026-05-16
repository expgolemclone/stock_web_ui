"""Server and browser configuration loading."""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import NotRequired, TypedDict

from stock_web_ui import CONFIG_DIR

_YAZI_BASE_DIR_ENV: str = "STOCK_WEB_UI_YAZI_BASE_DIR"


class _ServerSection(TypedDict):
    host: str
    port: int


class _YaziSection(TypedDict, total=False):
    base_dir: str


class _CliDefaultsToml(TypedDict):
    server: _ServerSection
    yazi: NotRequired[_YaziSection]


class _BrowsersSection(TypedDict):
    shikiho: str
    monex: str


class _AllowedUrlPrefixesSection(TypedDict):
    shikiho: str
    monex: str


class _MagicNumbersToml(TypedDict):
    browsers: _BrowsersSection
    allowed_url_prefixes: _AllowedUrlPrefixesSection


@dataclass(frozen=True, slots=True)
class ServerConfig:
    host: str
    port: int

    def __repr__(self) -> str:
        return f"ServerConfig(host={self.host!r}, port={self.port})"


@dataclass(frozen=True, slots=True)
class BrowserEntry:
    command: str
    allowed_url_prefix: str

    def __repr__(self) -> str:
        return f"BrowserEntry(command={self.command!r}, prefix={self.allowed_url_prefix!r})"


@dataclass(frozen=True, slots=True)
class BrowserConfig:
    entries: dict[str, BrowserEntry]

    def get_entry(self, key: str) -> BrowserEntry | None:
        return self.entries.get(key)

    def __repr__(self) -> str:
        return f"BrowserConfig(keys={list(self.entries.keys())})"


@dataclass(frozen=True, slots=True)
class YaziConfig:
    base_dir: Path | None

    def __repr__(self) -> str:
        return f"YaziConfig(base_dir={self.base_dir!r})"


def load_server_config() -> ServerConfig:
    raw: _CliDefaultsToml = _load_toml("cli_defaults.toml")
    section: _ServerSection = raw["server"]
    return ServerConfig(host=section["host"], port=section["port"])


def load_browser_config() -> BrowserConfig:
    raw: _MagicNumbersToml = _load_toml("magic_numbers.toml")
    browsers: _BrowsersSection = raw["browsers"]
    prefixes: _AllowedUrlPrefixesSection = raw["allowed_url_prefixes"]
    entries: dict[str, BrowserEntry] = {
        key: BrowserEntry(command=cmd, allowed_url_prefix=prefixes[key])
        for key, cmd in browsers.items()
    }
    return BrowserConfig(entries=entries)


def load_yazi_config() -> YaziConfig:
    raw_env_value: str | None = os.environ.get(_YAZI_BASE_DIR_ENV)
    if raw_env_value is not None:
        return YaziConfig(base_dir=_optional_path(raw_env_value))

    raw: _CliDefaultsToml = _load_toml("cli_defaults.toml")
    yazi_section: _YaziSection = raw.get("yazi", {})
    return YaziConfig(base_dir=_optional_path(yazi_section.get("base_dir")))


def _optional_path(raw_value: str | None) -> Path | None:
    if raw_value is None:
        return None
    value: str = raw_value.strip()
    if not value:
        return None
    return Path(value).expanduser()


def _load_toml[T](filename: str) -> T:
    toml_path = CONFIG_DIR / filename
    with toml_path.open("rb") as f:
        return tomllib.load(f)  # type: ignore[return-value]
