"""Aurex CLI.

Two modes:
- ``aurex audit ...`` (default if no subcommand) — runs the local heuristics
  audit and optional CI-policy build-breaker. Original behavior.
- ``aurex install-hook`` / ``uninstall-hook`` — writes/removes a `.pth` file
  in the active site-packages so that, with ``AUREX_ENABLED=1`` and
  ``AUREX_API_KEY=...``, every Python process auto-instruments LLM calls
  with no code changes.
"""

from __future__ import annotations

import argparse
import os
import site
import sys
import sysconfig
from pathlib import Path
from typing import List, Optional

from .ci_diff import compare_ledgers, format_regression_markdown
from .heuristics import LocalHeuristicsEngine

PTH_FILENAME = "aurex.pth"
PTH_BODY = "import aurex_sdk.hook\n"


# --------------------------------------------------------------------------- #
# install-hook / uninstall-hook
# --------------------------------------------------------------------------- #


def _candidate_site_dirs() -> List[Path]:
    """Return one or more site-packages directories suitable for the hook."""
    candidates: List[Path] = []

    purelib = sysconfig.get_paths().get("purelib")
    if purelib:
        candidates.append(Path(purelib))

    try:
        for p in site.getsitepackages():
            path = Path(p)
            if path not in candidates:
                candidates.append(path)
    except Exception:
        pass

    user = site.getusersitepackages()
    if user and Path(user) not in candidates:
        candidates.append(Path(user))

    return [c for c in candidates if c.exists()]


def _pick_install_dir(explicit: Optional[str]) -> Path:
    if explicit:
        path = Path(explicit).expanduser().resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    for d in _candidate_site_dirs():
        if os.access(d, os.W_OK):
            return d

    raise RuntimeError(
        "No writable site-packages directory found. "
        "Pass --target /path/to/site-packages explicitly."
    )


def cmd_install_hook(target: Optional[str]) -> int:
    install_dir = _pick_install_dir(target)
    pth_path = install_dir / PTH_FILENAME
    pth_path.write_text(PTH_BODY)
    print(f"[aurex] installed hook at {pth_path}")
    print("[aurex] set AUREX_ENABLED=1 AUREX_API_KEY=aux_... and run your app — no code changes needed.")
    return 0


def cmd_uninstall_hook(target: Optional[str]) -> int:
    removed = False
    candidates = [Path(target)] if target else _candidate_site_dirs()
    for d in candidates:
        pth = d / PTH_FILENAME
        if pth.exists():
            try:
                pth.unlink()
                print(f"[aurex] removed {pth}")
                removed = True
            except Exception as e:
                print(f"[aurex] failed to remove {pth}: {e}", file=sys.stderr)
    if not removed:
        print("[aurex] no hook found.")
    return 0


# --------------------------------------------------------------------------- #
# audit (legacy default behavior)
# --------------------------------------------------------------------------- #


def cmd_audit(args: argparse.Namespace) -> int:
    has_policy = (
        (args.fail_under is not None and args.fail_under > 0)
        or (args.max_waste_usd is not None and args.max_waste_usd != float("inf"))
        or (args.max_spend_usd is not None and args.max_spend_usd != float("inf"))
        or bool(getattr(args, "fail_on_regression", False))
    )

    if not os.path.exists(args.ledger):
        if has_policy:
            print(f"\033[91m🚨 POLICY ENFORCEMENT ERROR: Local ledger not found at: {args.ledger}\033[0m")
            print("Cannot verify build policies without local ledger telemetry. Build failed.")
            return 1
        print(f"\033[93m[Aurex Warning] Local ledger not found at: {args.ledger}\033[0m")
        print("Run some LLM requests first using AurexAuditor to populate the ledger.")
        return 0

    engine = LocalHeuristicsEngine(args.ledger)
    report = engine.analyze()

    total_events = report["total_events"]
    if total_events == 0 and has_policy:
        print(f"\033[91m🚨 POLICY ENFORCEMENT ERROR: Local ledger at {args.ledger} is empty.\033[0m")
        print("Cannot verify build policies with zero telemetry events. Build failed.")
        return 1
    total_cost = report["total_cost"]
    wasted_cost = report["wasted_cost"]
    waste_percentage = report["waste_percentage"]
    credit_score = report["credit_score"]
    issues = report["issues"]

    baseline_path = getattr(args, "baseline", None)
    fail_on_reg = bool(getattr(args, "fail_on_regression", False))
    github_comment = bool(getattr(args, "github_comment", False))

    if baseline_path and github_comment:
        diff = compare_ledgers(
            args.ledger,
            baseline_path,
            max_regression_pct=float(getattr(args, "max_regression_pct", 15.0)),
        )
        print(format_regression_markdown(diff))
        if diff.has_regression and (fail_on_reg or getattr(args, "mode", "warn") == "block"):
            return 1
        return 0

    score_color = "\033[92m" if credit_score >= 85 else "\033[93m" if credit_score >= 70 else "\033[91m"

    if not github_comment:
        print("\n" + "=" * 55)
        print("      🛡️  Aurex Local FinOps Audit Report")
        print("=" * 55)
        print(f"  • Local Ledger File:    {args.ledger}")
        print(f"  • Total LLM Requests:   {total_events:,}")
        print(f"  • Total Spend USD:      ${total_cost:.4f}")
        print(f"  • Wasted Spend USD:     ${wasted_cost:.4f}")
        print(f"  • Waste Ratio:          {waste_percentage}%")
        print(f"  • Token Credit Score:   {score_color}{credit_score} / 100\033[0m")
        print("=" * 55)

        if issues:
            print("\n🔎 Detected Waste Drivers:")
            for idx, issue in enumerate(issues[:5], 1):
                sev = issue["severity"]
                sev_color = "\033[91m" if sev == "CRITICAL" else "\033[93m"
                print(f"  {idx}. {sev_color}[{sev}]\033[0m \033[1m{issue['title']}\033[0m (-${issue['cost_impact']:.2f})")
                print(f"     └─ {issue['summary']}")
                print(f"     └─ CTA: \033[96m{issue['cta']}\033[0m")
            if len(issues) > 5:
                print(f"  ... and {len(issues) - 5} more issues.")
        else:
            print("\n\033[92m🎉 Excellent! No cost leakage or loop risks detected in the ledger.\033[0m")

        print("=" * 55)

    if baseline_path:
        diff = compare_ledgers(
            args.ledger,
            baseline_path,
            max_regression_pct=float(getattr(args, "max_regression_pct", 15.0)),
        )
        print("\n" + format_regression_markdown(diff) + "\n")
    else:
        diff = None

    failed = False
    fail_reasons: List[str] = []
    if args.fail_under > 0 and credit_score < args.fail_under:
        failed = True
        fail_reasons.append(f"Credit Score ({credit_score}) is below the required threshold of {args.fail_under}.")
    if wasted_cost > args.max_waste_usd:
        failed = True
        fail_reasons.append(f"Wasted cost (${wasted_cost:.4f}) exceeds the maximum allowed waste of ${args.max_waste_usd:.4f}.")
    if total_cost > args.max_spend_usd:
        failed = True
        fail_reasons.append(f"Total spend (${total_cost:.4f}) exceeds the maximum budget of ${args.max_spend_usd:.4f}.")
    if diff is not None and diff.has_regression and fail_on_reg:
        failed = True
        fail_reasons.extend(diff.regressions)

    if failed:
        if fail_on_reg or getattr(args, "mode", "warn") == "block":
            print("\n\033[91m🚨 BUILD BREAKER TRIPPED! CI/CD Audit Failed:\033[0m")
            for reason in fail_reasons:
                print(f"  ❌ {reason}")
            print("\nPlease optimize your LLM orchestration (e.g. enable caching, prune context) before deploying.")
            print("=" * 55 + "\n")
            return 1
        else:
            print("\n\033[93m⚠️ CI/CD POLICY WARNING: Cost & efficiency thresholds exceeded:\033[0m")
            for reason in fail_reasons:
                print(f"  ⚠️ {reason}")
            print("\nBuild continued. Set --mode=block to hard-fail in CI/CD.")
            print("=" * 55 + "\n")
            return 0
    print("\n\033[92m✅ CI/CD BUILD PASSED. Cost & efficiency policies are fully satisfied.\033[0m\n")
    return 0


# --------------------------------------------------------------------------- #
# Entrypoint
# --------------------------------------------------------------------------- #


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="aurex",
        description="Aurex AI FinOps CLI",
    )
    sub = parser.add_subparsers(dest="command")

    for sub_name in ("audit", "ci"):
        p_audit = sub.add_parser(sub_name, help="Run local audit & optional baseline diff on .aurex/ledger.jsonl")
        p_audit.add_argument("--ledger", default=".aurex/ledger.jsonl")
        p_audit.add_argument("--baseline", default=None, help="Path to main-branch baseline ledger.jsonl")
        p_audit.add_argument("--fail-on-regression", action="store_true", help="Exit 1 when baseline diff flags a regression")
        p_audit.add_argument("--max-regression-pct", type=float, default=15.0)
        p_audit.add_argument("--github-comment", action="store_true", help="Output clean PR Markdown diff")
        p_audit.add_argument("--fail-under", type=int, default=0)
        p_audit.add_argument("--max-waste-usd", type=float, default=float("inf"))
        p_audit.add_argument("--max-spend-usd", type=float, default=float("inf"))
        p_audit.add_argument("--mode", choices=["warn", "block"], default="warn", help="CI/CD block/fail mode (default: warn)")

    p_install = sub.add_parser(
        "install-hook",
        help="Install zero-code auto-instrumentation hook into site-packages",
    )
    p_install.add_argument(
        "--target",
        help="Optional explicit site-packages directory",
    )

    p_uninstall = sub.add_parser("uninstall-hook", help="Remove the auto-instrumentation hook")
    p_uninstall.add_argument("--target")

    # Legacy flags at top level (kept so `aurex --ledger ...` still works).
    parser.add_argument("--ledger", default=argparse.SUPPRESS)
    parser.add_argument("--baseline", default=argparse.SUPPRESS)
    parser.add_argument("--fail-on-regression", action="store_true", default=argparse.SUPPRESS)
    parser.add_argument("--max-regression-pct", type=float, default=argparse.SUPPRESS)
    parser.add_argument("--github-comment", action="store_true", default=argparse.SUPPRESS)
    parser.add_argument("--fail-under", type=int, default=argparse.SUPPRESS)
    parser.add_argument("--max-waste-usd", type=float, default=argparse.SUPPRESS)
    parser.add_argument("--max-spend-usd", type=float, default=argparse.SUPPRESS)
    parser.add_argument("--mode", default=argparse.SUPPRESS)

    return parser


def run_cli() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    if args.command == "install-hook":
        sys.exit(cmd_install_hook(args.target))
    if args.command == "uninstall-hook":
        sys.exit(cmd_uninstall_hook(args.target))

    # Default: audit / ci. Backfill legacy top-level flags into the audit namespace.
    audit_args = argparse.Namespace(
        ledger=getattr(args, "ledger", ".aurex/ledger.jsonl"),
        baseline=getattr(args, "baseline", None),
        fail_on_regression=getattr(args, "fail_on_regression", False),
        max_regression_pct=getattr(args, "max_regression_pct", 15.0),
        github_comment=getattr(args, "github_comment", False),
        fail_under=getattr(args, "fail_under", 0),
        max_waste_usd=getattr(args, "max_waste_usd", float("inf")),
        max_spend_usd=getattr(args, "max_spend_usd", float("inf")),
        mode=getattr(args, "mode", "warn"),
    )
    sys.exit(cmd_audit(audit_args))


if __name__ == "__main__":
    run_cli()
