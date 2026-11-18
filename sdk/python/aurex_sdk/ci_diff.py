"""Stage 3: Shift-Left CI Baseline vs. Branch Ledger Regression Diff."""

from __future__ import annotations

import json
import os
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class LedgerMetrics:
    total_cost: float = 0.0
    llm_calls: int = 0
    effective_successes: int = 0
    cost_per_success: Optional[float] = None
    turns_per_success: Optional[float] = None
    input_tokens: int = 0
    cached_tokens: int = 0
    cache_hit_pct: float = 0.0
    cliff_200k_calls: int = 0
    prefix_breaks: int = 0
    reasoning_tokens: int = 0
    aborted_streams: int = 0
    unfulfilled_spend: float = 0.0


@dataclass
class RegressionDiff:
    baseline: LedgerMetrics
    current: LedgerMetrics
    regressions: List[str] = field(default_factory=list)

    @property
    def has_regression(self) -> bool:
        return len(self.regressions) > 0


def _read_jsonl(path: str) -> List[Dict[str, Any]]:
    if not path or not os.path.exists(path):
        return []
    rows: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    return rows


def summarize_ledger(path: str) -> LedgerMetrics:
    """Compute Stage 1 + Stage 2 + Stage 3 metrics from a JSONL ledger file."""
    events = _read_jsonl(path)
    m = LedgerMetrics()

    wf_sig_total: Dict[str, int] = defaultdict(int)
    wf_sig_succ: Dict[str, int] = defaultdict(int)
    wf_call_succ: Dict[str, int] = defaultdict(int)
    unscoped_sig_total = 0
    unscoped_sig_succ = 0
    unscoped_call_succ = 0

    for ev in events:
        ct = str(ev.get("cost_type") or "").lower()
        out = str(ev.get("outcome") or "").lower()
        wf = ev.get("workflow_id")

        if ct == "outcome_signal":
            if wf:
                wf_sig_total[wf] += 1
                if out == "success":
                    wf_sig_succ[wf] += 1
            else:
                unscoped_sig_total += 1
                if out == "success":
                    unscoped_sig_succ += 1
            continue

        cost = float(ev.get("cost") if ev.get("cost") is not None else (ev.get("cost_usd") or 0.0))
        in_toks = int(ev.get("input_tokens") or 0)
        cached = int(ev.get("cached_tokens") or 0)
        reas = int(ev.get("reasoning_tokens") or 0)

        m.total_cost += cost
        m.llm_calls += 1
        m.input_tokens += in_toks
        m.cached_tokens += cached
        m.reasoning_tokens += reas

        if in_toks > 200_000:
            m.cliff_200k_calls += 1
        shield = (ev.get("extra_metadata") or {}).get("aurex_shield") or {}
        if isinstance(shield, dict) and shield.get("prefix_broken"):
            m.prefix_breaks += 1
        if str(ev.get("status") or "").lower() == "aborted_stream":
            m.aborted_streams += 1
        if ct == "unfulfilled_spend" or out == "degraded":
            m.unfulfilled_spend += cost

        if wf:
            if out == "success":
                wf_call_succ[wf] += 1
        elif out == "success":
            unscoped_call_succ += 1

    all_wfs = set(wf_sig_total.keys()) | set(wf_call_succ.keys())
    succ = sum(wf_sig_succ[w] if wf_sig_total[w] > 0 else wf_call_succ[w] for w in all_wfs)
    succ += unscoped_sig_succ if unscoped_sig_total > 0 else unscoped_call_succ

    m.effective_successes = succ
    m.cache_hit_pct = round((m.cached_tokens / m.input_tokens * 100.0), 1) if m.input_tokens > 0 else 0.0
    m.cost_per_success = round(m.total_cost / succ, 6) if succ > 0 else None
    m.turns_per_success = round(m.llm_calls / succ, 2) if succ > 0 else None
    m.total_cost = round(m.total_cost, 6)
    m.unfulfilled_spend = round(m.unfulfilled_spend, 6)
    return m


def compare_ledgers(
    current_path: str,
    baseline_path: str,
    max_regression_pct: float = 15.0,
) -> RegressionDiff:
    """Compare PR ledger against baseline ledger and detect Stage 1/2/3 regressions."""
    base = summarize_ledger(baseline_path)
    curr = summarize_ledger(current_path)
    regressions: List[str] = []

    if base.cost_per_success and curr.cost_per_success:
        delta_pct = ((curr.cost_per_success - base.cost_per_success) / base.cost_per_success) * 100.0
        if delta_pct > max_regression_pct:
            regressions.append(
                f"Cost per success increased by +{delta_pct:.1f}% "
                f"(${base.cost_per_success:.4f} -> ${curr.cost_per_success:.4f})"
            )
    elif base.total_cost > 0 and curr.total_cost > base.total_cost * (1.0 + max_regression_pct / 100.0):
        delta_pct = ((curr.total_cost - base.total_cost) / base.total_cost) * 100.0
        regressions.append(f"Total LLM spend increased by +{delta_pct:.1f}% (${base.total_cost:.4f} -> ${curr.total_cost:.4f})")

    if base.cache_hit_pct - curr.cache_hit_pct > 15.0:
        regressions.append(
            f"Prefix cache hit rate dropped from {base.cache_hit_pct:.1f}% to {curr.cache_hit_pct:.1f}%"
        )
    if curr.cliff_200k_calls > base.cliff_200k_calls:
        regressions.append(
            f"New >200k 2x pricing cliff calls introduced ({base.cliff_200k_calls} -> {curr.cliff_200k_calls})"
        )
    if curr.unfulfilled_spend > base.unfulfilled_spend + 1e-6:
        regressions.append(
            f"Unfulfilled soft-failure spend increased (${base.unfulfilled_spend:.4f} -> ${curr.unfulfilled_spend:.4f})"
        )

    return RegressionDiff(baseline=base, current=curr, regressions=regressions)


def format_regression_markdown(diff: RegressionDiff) -> str:
    """Render a concise GitHub PR comment comparing baseline vs. current branch."""
    b, c = diff.baseline, diff.current
    b_cps = f"${b.cost_per_success:.4f}" if b.cost_per_success is not None else "n/a"
    c_cps = f"${c.cost_per_success:.4f}" if c.cost_per_success is not None else "n/a"
    b_tps = f"{b.turns_per_success:.2f}" if b.turns_per_success is not None else "n/a"
    c_tps = f"{c.turns_per_success:.2f}" if c.turns_per_success is not None else "n/a"

    status = "⚠️ Regression Detected" if diff.has_regression else "✅ No Cost Regression"
    lines = [
        f"## Aurex CI FinOps Diff ({status})",
        "",
        "| Metric | Baseline (`main`) | Current Branch |",
        "| :--- | :---: | :---: |",
        f"| Cost per Successful Outcome | {b_cps} | {c_cps} |",
        f"| Turns per Success | {b_tps} | {c_tps} |",
        f"| Prefix Cache Hit % | {b.cache_hit_pct:.1f}% | {c.cache_hit_pct:.1f}% |",
        f"| `>200k` 2x Cliff Calls | {b.cliff_200k_calls} | {c.cliff_200k_calls} |",
        f"| Reasoning / Thinking Tokens | {b.reasoning_tokens} | {c.reasoning_tokens} |",
        f"| Unfulfilled Soft-Failure Spend | ${b.unfulfilled_spend:.4f} | ${c.unfulfilled_spend:.4f} |",
        f"| Total Tracked Spend | ${b.total_cost:.4f} | ${c.total_cost:.4f} |",
    ]
    if diff.regressions:
        lines.extend(["", "### Regressions Flagged"])
        for item in diff.regressions:
            lines.append(f"- {item}")
    return "\n".join(lines)
