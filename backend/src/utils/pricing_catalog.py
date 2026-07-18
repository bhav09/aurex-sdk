"""
Provider pricing catalog - May 2026.

Loads structured per-model pricing from backend/data/pricing/<provider>.json
files (scraped from official provider docs by scripts/scrape_pricing.py).

Per-model entry shape:
    {
      "id": "claude-opus-4-7",
      "aliases": ["claude-opus-4-7-20260423", ...],
      "input_per_1m": 5.0,
      "cached_input_per_1m": 0.50,
      "cache_write_5m_per_1m": 6.25,
      "cache_write_1h_per_1m": 10.0,
      "output_per_1m": 25.0,
      "reasoning_per_1m": null,                           # falls back to output_per_1m
      "context_tier_overrides": {
        "200k-1M": {"input_per_1m": ..., "output_per_1m": ...}
      },
      "modality_pricing": {                                # optional
        "audio_input_per_1m": ..., "audio_output_per_1m": ...,
        "video_input_per_1m": ...
      },
      "tool_pricing": {                                    # optional, server-tool surcharges
        "web_search_per_1k": 10.0,
        "code_execution_per_hour": 0.05
      }
    }

Top-level fields per provider:
    tier_multipliers: { standard: 1.0, batch: 0.5, priority: 1.5, fast: 6.0, ... }
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

PRICING_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "pricing",
)

PROVIDERS = ("openai", "anthropic", "google", "azure", "aws")

# Conservative fallback when a model is not in any catalog. Values picked to
# overstate-not-understate (so unknown models flag as expensive rather than
# silently appearing free).
DEFAULT_PRICING = {
    "input_per_1m": 5.00,
    "cached_input_per_1m": 0.50,
    "output_per_1m": 20.00,
    "reasoning_per_1m": None,
}


@dataclass
class ModelPricing:
    id: str
    provider: str
    input_per_1m: float
    output_per_1m: float
    cached_input_per_1m: float | None = None
    cache_write_5m_per_1m: float | None = None
    cache_write_1h_per_1m: float | None = None
    reasoning_per_1m: float | None = None
    context_tier_overrides: dict[str, dict[str, float]] = field(default_factory=dict)
    modality_pricing: dict[str, float] = field(default_factory=dict)
    tool_pricing: dict[str, float] = field(default_factory=dict)
    aliases: list[str] = field(default_factory=list)
    deprecated_after: str | None = None
    notes: str | None = None
    source_url: str | None = None
    scraped_at: str | None = None


@dataclass
class ProviderCatalog:
    provider: str
    tier_multipliers: dict[str, float]
    tool_pricing_defaults: dict[str, float]
    models: dict[str, ModelPricing]   # keyed by id and every alias (lowercased)
    source_url: str | None = None
    scraped_at: str | None = None


def _load_provider(name: str) -> ProviderCatalog | None:
    path = os.path.join(PRICING_DIR, f"{name}.json")
    if not os.path.isfile(path):
        return None
    with open(path, "r") as f:
        raw = json.load(f)

    tier_multipliers = raw.get("tier_multipliers") or {"standard": 1.0}
    tool_defaults = raw.get("tool_pricing_defaults") or {}

    models: dict[str, ModelPricing] = {}
    for entry in raw.get("models", []):
        mp = ModelPricing(
            id=entry["id"],
            provider=name,
            input_per_1m=float(entry["input_per_1m"]),
            output_per_1m=float(entry["output_per_1m"]),
            cached_input_per_1m=_maybe_float(entry.get("cached_input_per_1m")),
            cache_write_5m_per_1m=_maybe_float(entry.get("cache_write_5m_per_1m")),
            cache_write_1h_per_1m=_maybe_float(entry.get("cache_write_1h_per_1m")),
            reasoning_per_1m=_maybe_float(entry.get("reasoning_per_1m")),
            context_tier_overrides=entry.get("context_tier_overrides") or {},
            modality_pricing=entry.get("modality_pricing") or {},
            tool_pricing=entry.get("tool_pricing") or {},
            aliases=list(entry.get("aliases") or []),
            deprecated_after=entry.get("deprecated_after"),
            notes=entry.get("notes"),
            source_url=raw.get("source_url"),
            scraped_at=raw.get("scraped_at"),
        )
        models[mp.id.lower()] = mp
        for alias in mp.aliases:
            models[alias.lower()] = mp

    return ProviderCatalog(
        provider=name,
        tier_multipliers=tier_multipliers,
        tool_pricing_defaults=tool_defaults,
        models=models,
        source_url=raw.get("source_url"),
        scraped_at=raw.get("scraped_at"),
    )


def _maybe_float(v: Any) -> float | None:
    if v is None:
        return None
    return float(v)


@lru_cache(maxsize=1)
def all_catalogs() -> dict[str, ProviderCatalog]:
    out: dict[str, ProviderCatalog] = {}
    for name in PROVIDERS:
        cat = _load_provider(name)
        if cat is not None:
            out[name] = cat
    return out


def reload_catalogs() -> None:
    """Drop the LRU cache; call after rewriting any data/pricing/*.json file."""
    all_catalogs.cache_clear()


def canonicalize_model(model: str) -> str:
    """
    Strip provider prefixes commonly seen in usage exports so a single catalog
    lookup matches across surfaces.
        models/gemini-3.1-flash         → gemini-3.1-flash
        publishers/google/models/...    → ...
        bedrock/anthropic.claude-opus-4-7 → anthropic.claude-opus-4-7
        anthropic/claude-opus-4-7       → claude-opus-4-7
    """
    m = model.strip().lower()
    for prefix in ("models/", "publishers/google/models/", "bedrock/", "anthropic/", "openai/", "google/"):
        if m.startswith(prefix):
            m = m[len(prefix):]
    return m


def lookup_model(model: str, provider_hint: str | None = None) -> tuple[str, ModelPricing] | None:
    """
    Returns (provider, ModelPricing) for the best match, or None.
    If provider_hint is given, prefer that catalog; otherwise scan all.
    """
    canon = canonicalize_model(model)
    catalogs = all_catalogs()

    if provider_hint:
        cat = catalogs.get(provider_hint)
        if cat:
            mp = cat.models.get(canon)
            if mp:
                return provider_hint, mp

    for prov_name, cat in catalogs.items():
        mp = cat.models.get(canon)
        if mp:
            return prov_name, mp

    # Last-chance loose match: catalog ids that are a prefix of the canonicalized
    # model (handles snapshotted versions like "gpt-5.5-2026-04-23" vs "gpt-5.5").
    for prov_name, cat in catalogs.items():
        for cid, mp in cat.models.items():
            if canon.startswith(cid + "-") or canon.startswith(cid + "@"):
                return prov_name, mp
    return None


def tier_multiplier(provider: str, tier: str | None) -> float:
    if not tier:
        return 1.0
    cat = all_catalogs().get(provider)
    if not cat:
        return 1.0
    return cat.tier_multipliers.get(tier, 1.0)
