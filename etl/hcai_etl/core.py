"""Shared building blocks for every dataset pipeline.

A dataset pipeline is a subclass of `Dataset` that knows three things:
  1. which source files to fetch (`resources()`),
  2. how to turn them into one tidy DataFrame (`load()`),
  3. what to write for the app (`build()`).

Everything else — CKAN lookups, download caching, column-name cleanup, JSON
output — lives here so new HCAI datasets (Quarterly Financial & Utilization,
Annual Disclosure complete set, Case Mix Index, ...) only implement the parts
that are genuinely dataset-specific.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "data" / "raw"  # gitignored download cache
PROCESSED_DIR = REPO_ROOT / "data" / "processed"  # committed; read by the app

CKAN_API = "https://data.chhs.ca.gov/api/3/action"
USER_AGENT = "hcai-insights-etl/0.1 (+https://github.com/)"


# --------------------------------------------------------------------------- #
# Source discovery & download
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Resource:
    """One downloadable file inside a CKAN package."""

    name: str
    url: str
    format: str
    # Free-form tags the dataset pipeline attaches (e.g. {"year": 2024}).
    tags: dict[str, Any] = field(default_factory=dict, hash=False, compare=False)


def ckan_package(package_id: str) -> dict:
    resp = requests.get(
        f"{CKAN_API}/package_show",
        params={"id": package_id},
        headers={"User-Agent": USER_AGENT},
        timeout=60,
    )
    resp.raise_for_status()
    payload = resp.json()
    if not payload.get("success"):
        raise RuntimeError(f"CKAN package_show failed for {package_id}: {payload}")
    return payload["result"]


def download(resource: Resource, dest_dir: Path, refresh: bool = False) -> Path:
    """Download a resource once and reuse the cached copy on later runs."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = resource.url.rsplit("/", 1)[-1]
    dest = dest_dir / filename
    if dest.exists() and not refresh:
        return dest
    print(f"  downloading {resource.name}")
    with requests.get(
        resource.url, headers={"User-Agent": USER_AGENT}, stream=True, timeout=300
    ) as resp:
        resp.raise_for_status()
        tmp = dest.with_suffix(dest.suffix + ".part")
        with open(tmp, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=1 << 16):
                fh.write(chunk)
        tmp.replace(dest)
    return dest


# --------------------------------------------------------------------------- #
# Column normalization
# --------------------------------------------------------------------------- #


def normalize_column(name: str, aliases: dict[str, str] | None = None) -> str:
    """Canonicalize an HCAI column header.

    HCAI headers drift between extracts ("NAT_ BIRTHS" vs "NAT_0BIRTHS",
    "INTER-REC" vs "INTER_REC", "MCAR_PRO#"). We upper-case, turn spaces and
    hyphens into underscores, spell out '#', and then apply dataset-specific
    aliases for anything still irregular.
    """
    raw = str(name).strip().upper()
    if aliases and raw in aliases:
        return aliases[raw]
    canon = raw.replace("#", "_NO")
    canon = re.sub(r"[\s\-]+", "_", canon)
    canon = re.sub(r"_+", "_", canon).strip("_")
    if aliases and canon in aliases:
        return aliases[canon]
    return canon


# --------------------------------------------------------------------------- #
# Output helpers
# --------------------------------------------------------------------------- #


def clean_value(value: Any) -> Any:
    """Make a scalar JSON-safe: NaN/inf -> None, numpy -> python, dates -> ISO."""
    if value is None:
        return None
    if hasattr(value, "item") and not isinstance(value, (str, bytes)):
        value = value.item()  # numpy scalar -> python scalar
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        if value.is_integer() and abs(value) < 1e15:
            return int(value)
        return round(value, 4)
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def write_json(path: Path, payload: Any, compact: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        if compact:
            json.dump(payload, fh, separators=(",", ":"), ensure_ascii=False)
        else:
            json.dump(payload, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    size_kb = path.stat().st_size / 1024
    print(f"  wrote {path.relative_to(REPO_ROOT)} ({size_kb:,.0f} KB)")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------- #
# Dataset contract
# --------------------------------------------------------------------------- #


class Dataset:
    """Base class for an HCAI dataset pipeline.

    Subclasses set the class attributes and implement `resources`, `load`, and
    `build`. `run()` wires them together.
    """

    id: str  # slug used for output folder, e.g. "hafd-selected"
    title: str
    ckan_package: str | None = None  # CKAN package id/name on data.chhs.ca.gov
    source_page: str | None = None

    def __init__(self, refresh: bool = False, years: Iterable[int] | None = None):
        self.refresh = refresh
        self.years = sorted(set(years)) if years else None

    @property
    def raw_dir(self) -> Path:
        return RAW_DIR / self.id

    @property
    def out_dir(self) -> Path:
        return PROCESSED_DIR / self.id

    def resources(self) -> list[Resource]:
        raise NotImplementedError

    def load(self, files: list[tuple[Resource, Path]]):
        raise NotImplementedError

    def build(self, frame) -> None:
        raise NotImplementedError

    def run(self) -> None:
        print(f"[{self.id}] {self.title}")
        resources = self.resources()
        if not resources:
            raise RuntimeError(f"No resources selected for {self.id}")
        files = [(r, download(r, self.raw_dir, self.refresh)) for r in resources]
        frame = self.load(files)
        self.build(frame)
        print(f"[{self.id}] done")
