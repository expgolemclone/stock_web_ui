"""Public paths for stock_web_ui runtime assets and configuration."""

from __future__ import annotations

from pathlib import Path

_PACKAGE_DIR: Path = Path(__file__).resolve().parent
_PROJECT_ROOT: Path = _PACKAGE_DIR.parent.parent


def _resolve_data_dir(package_relative: str, source_relative: str) -> Path:
    package_path: Path = _PACKAGE_DIR / package_relative
    if package_path.exists():
        return package_path
    return _PROJECT_ROOT / source_relative


ASSETS_DIR: Path = _resolve_data_dir("assets", "docs/assets")
CONFIG_DIR: Path = _resolve_data_dir("config", "config")
TEMPLATES_DIR: Path = _resolve_data_dir("templates", "docs")
INDEX_TEMPLATE_PATH: Path = TEMPLATES_DIR / "index.template.html"

__all__ = [
    "ASSETS_DIR",
    "CONFIG_DIR",
    "INDEX_TEMPLATE_PATH",
    "TEMPLATES_DIR",
]
