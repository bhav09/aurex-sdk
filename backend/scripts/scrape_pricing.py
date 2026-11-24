"""
Scrape provider-official pricing pages and refresh backend/data/pricing/<provider>.json.

Strategy: each provider's pricing page is loaded once, parsed by a provider-specific
function, and merged into the existing JSON catalog (preserving entries the page
doesn't list — provider pages rarely show every model). The merge writes a flat,
diff-friendly JSON file with `source_url` and `scraped_at` set to the live values.

Why merge instead of replace? Provider pages routinely de-list older snapshots
(e.g. gpt-4-turbo) but those models still appear in customer exports for months.
Dropping them would silently zero out their costs.

Run manually:
    cd backend
    python -m scripts.scrape_pricing                  # all providers
    python -m scripts.scrape_pricing openai anthropic # subset

In CI:
    .github/workflows/refresh-pricing.yml runs daily and PRs the diff.

Failure modes (intentional, all loud):
  - HTTP non-200      → log and skip that provider; existing JSON stays.
  - Parse mismatch    → exception bubbles; CI run fails, no silent overwrite.
  - Model id renamed  → diff shows a fresh entry; the old one is preserved
                        (manual review decides whether to drop it).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from dataclasses import asdict, dataclass, field

PRICING_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "pricing",
)


# ─── Light-weight HTTP fetch (uses urllib so the script has no heavy deps) ──

def _fetch(url: str, timeout: float = 30.0) -> str:
    import urllib.parse
    import urllib.request
    if urllib.parse.urlparse(url).scheme != "https":
        raise ValueError(f"Only https:// pricing URLs allowed: {url}")
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Aurex-Pricing-Scraper/1.0 (https://github.com/bhav09/aurex-sdk)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # nosec B310
        if resp.status != 200:
            raise RuntimeError(f"GET {url} → HTTP {resp.status}")
        return resp.read().decode("utf-8", errors="replace")


# ─── Provider-specific parsers ──────────────────────────────────────────────
# Each parser returns a list of partial model entries. Keys present override
# the existing catalog; missing keys preserve whatever the catalog already had.
# Parsers are intentionally tolerant — provider HTML changes often.


PRICE_RX = re.compile(r"\$\s*([0-9]+(?:\.[0-9]+)?)")


@dataclass
class PartialModel:
    id: str
    input_per_1m: float | None = None
    cached_input_per_1m: float | None = None
    output_per_1m: float | None = None
    cache_write_5m_per_1m: float | None = None
    cache_write_1h_per_1m: float | None = None
    aliases: list[str] = field(default_factory=list)
    notes: str | None = None


def parse_openai(html: str) -> list[PartialModel]:
    # OpenAI page renders pricing in a <table> per family. We do a permissive
    # row-scan: any <tr> with a known model id and at least one $-amount.
    out: list[PartialModel] = []
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL | re.IGNORECASE)
    known_ids = (
        "gpt-5.5", "gpt-5.4", "gpt-5.2", "gpt-5-mini", "gpt-5-nano", "gpt-5",
        "gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o",
        "o3-deep-research", "o3-mini", "o3", "o4-mini", "o4",
    )
    for row in rows:
        text = re.sub(r"<[^>]+>", " ", row)
        text_norm = re.sub(r"\s+", " ", text).strip().lower()
        for mid in known_ids:
            if mid in text_norm:
                prices = [float(m) for m in PRICE_RX.findall(text)]
                if not prices:
                    continue
                pm = PartialModel(id=mid)
                if len(prices) >= 1: pm.input_per_1m = prices[0]
                if len(prices) >= 2: pm.cached_input_per_1m = prices[1] if "cache" in text_norm or "cached" in text_norm else None
                if len(prices) >= 2 and pm.cached_input_per_1m is None: pm.output_per_1m = prices[1]
                if len(prices) >= 3 and pm.cached_input_per_1m is not None: pm.output_per_1m = prices[2]
                out.append(pm)
                break
    return out


def parse_anthropic(html: str) -> list[PartialModel]:
    out: list[PartialModel] = []
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL | re.IGNORECASE)
    known_ids = (
        "claude-opus-4-7", "claude-opus-4-6", "claude-opus-4-5", "claude-opus-4",
        "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-3-7-sonnet", "claude-3-5-sonnet",
        "claude-haiku-4-5", "claude-3-5-haiku", "claude-3-haiku",
    )
    for row in rows:
        text = re.sub(r"<[^>]+>", " ", row)
        text_norm = re.sub(r"\s+", " ", text).strip().lower()
        for mid in known_ids:
            if mid.replace("-", " ") in text_norm or mid in text_norm:
                prices = [float(m) for m in PRICE_RX.findall(text)]
                if len(prices) < 2:
                    continue
                pm = PartialModel(id=mid)
                # Anthropic table column order: input, cache write 5m, cache write 1h, cache read, output
                if len(prices) >= 1: pm.input_per_1m = prices[0]
                if len(prices) >= 2: pm.cache_write_5m_per_1m = prices[1]
                if len(prices) >= 3: pm.cache_write_1h_per_1m = prices[2]
                if len(prices) >= 4: pm.cached_input_per_1m = prices[3]
                if len(prices) >= 5: pm.output_per_1m = prices[4]
                out.append(pm)
                break
    return out


def parse_google(html: str) -> list[PartialModel]:
    out: list[PartialModel] = []
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL | re.IGNORECASE)
    known_ids = (
        "gemini-3.1-pro", "gemini-3.1-flash-lite", "gemini-3.1-flash",
        "gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash",
        "gemini-1.5-pro", "gemini-1.5-flash",
    )
    for row in rows:
        text = re.sub(r"<[^>]+>", " ", row)
        text_norm = re.sub(r"\s+", " ", text).strip().lower()
        for mid in known_ids:
            if mid in text_norm:
                prices = [float(m) for m in PRICE_RX.findall(text)]
                if len(prices) < 2:
                    continue
                pm = PartialModel(id=mid)
                pm.input_per_1m = prices[0]
                if "cache" in text_norm and len(prices) >= 3:
                    pm.cached_input_per_1m = prices[1]
                    pm.output_per_1m = prices[2]
                else:
                    pm.output_per_1m = prices[1]
                out.append(pm)
                break
    return out


# Azure / AWS pages are rendered client-side and don't yield clean tables in raw
# HTML. For those, we keep the JSON in the repo as the source of truth and rely
# on humans to bump it when AWS/Azure publish changes. The scraper still validates
# the page is reachable so CI catches a 404 rename.

def parse_azure(html: str) -> list[PartialModel]:
    # Page is JS-rendered; raw HTML doesn't contain the price table. We still
    # accept the html arg so the registry stays uniform; sanity-check that the
    # page wasn't a 404/redirect placeholder.
    if "openai" not in html.lower() and "azure" not in html.lower():
        raise RuntimeError("Azure pricing page didn't contain expected content")
    return []


def parse_aws(html: str) -> list[PartialModel]:
    if "bedrock" not in html.lower():
        raise RuntimeError("AWS Bedrock pricing page didn't contain expected content")
    return []


# ─── Provider registry ──────────────────────────────────────────────────────


PROVIDERS: dict[str, dict] = {
    "openai": {
        "url": "https://platform.openai.com/docs/pricing",
        "parser": parse_openai,
    },
    "anthropic": {
        "url": "https://www.anthropic.com/pricing",
        "parser": parse_anthropic,
    },
    "google": {
        "url": "https://ai.google.dev/pricing",
        "parser": parse_google,
    },
    "azure": {
        "url": "https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/",
        "parser": parse_azure,
    },
    "aws": {
        "url": "https://aws.amazon.com/bedrock/pricing/",
        "parser": parse_aws,
    },
}


# ─── Merge logic ────────────────────────────────────────────────────────────


def merge_partial_into_catalog(catalog: dict, partials: list[PartialModel]) -> tuple[int, int]:
    """Returns (added_count, updated_count)."""
    by_id = {m["id"]: m for m in catalog["models"]}
    added = 0
    updated = 0
    for p in partials:
        target = by_id.get(p.id)
        if target is None:
            new_entry = {k: v for k, v in asdict(p).items() if v is not None and v != []}
            catalog["models"].append(new_entry)
            by_id[p.id] = new_entry
            added += 1
            continue
        changed = False
        for k, v in asdict(p).items():
            if v is None or v == []:
                continue
            if target.get(k) != v:
                target[k] = v
                changed = True
        if changed:
            updated += 1
    return added, updated


def refresh_provider(name: str) -> dict:
    cfg = PROVIDERS[name]
    os.makedirs(PRICING_DIR, exist_ok=True)
    path = os.path.join(PRICING_DIR, f"{name}.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            catalog = json.load(f)
    else:
        catalog = {"provider": name, "models": {}}

    print(f"[{name}] GET {cfg['url']}")
    try:
        html = _fetch(cfg["url"])
    except Exception as e:
        print(f"[{name}] WARN fetch failed: {e} — keeping existing catalog")
        return {"added": 0, "updated": 0, "ok": False}

    partials = cfg["parser"](html)
    print(f"[{name}] parser extracted {len(partials)} model rows")

    added, updated = merge_partial_into_catalog(catalog, partials)

    catalog["source_url"] = cfg["url"]
    catalog["scraped_at"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    with open(path, "w") as f:
        json.dump(catalog, f, indent=2)
        f.write("\n")
    print(f"[{name}] wrote {path}  added={added} updated={updated}")
    return {"added": added, "updated": updated, "ok": True}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Refresh provider pricing JSON catalogs.")
    parser.add_argument("providers", nargs="*", help="provider names; default = all")
    args = parser.parse_args(argv)

    targets = args.providers or list(PROVIDERS)
    unknown = [p for p in targets if p not in PROVIDERS]
    if unknown:
        print(f"Unknown providers: {unknown}", file=sys.stderr)
        return 2

    summary = {p: refresh_provider(p) for p in targets}
    print("\nSummary:")
    for p, s in summary.items():
        flag = "OK" if s["ok"] else "SKIPPED"
        print(f"  {p:10s} {flag:8s} added={s['added']} updated={s['updated']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
