"""Observe the actual upstream matcher. Never reimplement filtering or ranking."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import sys


def digest(file: Path) -> str:
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--upstream-script", required=True)
    parser.add_argument("--trace-out", required=True)
    args, forwarded = parser.parse_known_args()
    upstream = Path(args.upstream_script).resolve()
    source = upstream.read_text(encoding="utf-8")
    source_lines = {i: line.strip() for i, line in enumerate(source.splitlines(), 1)}
    if sum(line == "top = ranked[: a.top]" for line in source_lines.values()) != 2:
        raise RuntimeError("Upstream matcher changed; trace hooks need review")
    report = {"schema": "talkcraft-candidate-trace-v1", "matcher": str(upstream),
              "matcherSha256": digest(upstream), "index": None, "inputs": [], "shots": [],
              "exitCode": None, "captureComplete": False,
              "limitation": "Observed upstream retrieval/ranking only; not template runtime or production admission."}
    phase = None
    current = None

    def capture(local: dict, status: str = "ranked") -> None:
        if current is None or phase is None:
            raise RuntimeError("Trace context missing")
        pool = local.get("pool", [])
        pool_ids = {card["slug"] for card in pool}
        ranked = local.get("ranked", [])
        bad = local.get("bad", []) if phase != "素材承接" else []
        # For carrier search the upstream pool is already feasibility-filtered.
        # Do not invent reasons for cards it never evaluated in that branch.
        current["searches"].append({
            "semantic": phase, "status": status,
            "indexCards": [card["slug"] for card in local["cards"]],
            "poolCards": [card["slug"] for card in pool],
            "outsidePool": [card["slug"] for card in local["cards"] if card["slug"] not in pool_ids],
            "outsidePoolReason": "semantic_mismatch" if phase != "素材承接" else "not_carrier_or_material_infeasible",
            "materialRejected": [{"slug": card["slug"], "reason": reason} for card, reason in bad],
            "ranked": [{"slug": card["slug"], "score": score, "why": why} for card, score, why in ranked],
            "recommended": [card["slug"] for card, _, _ in ranked[:local["a"].top]] if status == "ranked" else [],
            "alreadySelectedCarriers": sorted(local.get("already", [])) if status == "already_selected" else [],
        })

    def observe(frame, event, value):
        nonlocal phase, current
        if os.path.normcase(os.path.abspath(frame.f_code.co_filename)) != os.path.normcase(str(upstream)):
            return None
        if frame.f_code.co_name == "feasible":
            if event == "return" and current is not None and isinstance(value, tuple):
                current["feasibilityChecks"].append({"semantic": phase,
                    "slug": frame.f_locals["card"]["slug"], "feasible": value[0], "reason": value[1]})
            return observe
        if frame.f_code.co_name != "main":
            return None
        if event != "line":
            return observe
        line = source_lines.get(frame.f_lineno, "")
        local = frame.f_locals
        if line.startswith("doc = json.load("):
            index = Path(local["a"].index).resolve()
            report["index"] = {"file": str(index), "sha256": digest(index),
                               "cards": len(local["cards"]), "top": local["a"].top}
            report["inputs"] = [{"file": str(Path(local[name]).resolve()), "sha256": digest(Path(local[name]))}
                                for name in ("sem_p", "sb_p")]
        elif line.startswith("sents = by_shot.get("):
            current = {"shotId": local["sh"]["id"], "position": local["pos"],
                       "materialKinds": sorted(local["sh"]["kinds"]), "searches": [], "waivers": {}, "feasibilityChecks": []}
            report["shots"].append(current)
        elif line.startswith('fam_needed = sh["kinds"]'):
            current["semantics"] = list(local["sems"])
        elif line == 'pool = [c for c in cards if w in c["semantics"]]':
            phase = local["w"]
        elif line.startswith('pool = [c for c in cards if is_carrier(c)'):
            phase = "素材承接"
        elif line == "top = ranked[: a.top]":
            capture(local)
        elif line.startswith('uncovered.append(f"{sh[\'id\']}·{w}")'):
            capture(local, "no_feasible_card")
        elif line == "if already:" and local.get("already"):
            capture(local, "already_selected")
        elif line.startswith('uncovered.append(f"{sh[\'id\']}·素材承接")'):
            capture(local, "no_feasible_card")
        elif line == "if w in waived:" and local["w"] in local["waived"]:
            current["waivers"][local["w"]] = local["waived"][local["w"]]
        return observe

    old_argv, old_trace = sys.argv, sys.gettrace()
    code = 0
    try:
        sys.argv = [str(upstream), *forwarded]
        sys.settrace(observe)
        try:
            runpy.run_path(str(upstream), run_name="__main__")
        except SystemExit as error:
            code = error.code if isinstance(error.code, int) else (0 if error.code is None else 1)
        report["captureComplete"] = report["index"] is not None and digest(upstream) == report["matcherSha256"] and all(
            digest(Path(item["file"])) == item["sha256"] for item in [*report["inputs"], report["index"]])
        report["semanticCoverage"] = {"shotbookShots": len(report["shots"]),
            "shotsWithSemantics": sum(bool(shot.get("semantics")) for shot in report["shots"]),
            "shotsWithoutSemantics": [shot["shotId"] for shot in report["shots"] if not shot.get("semantics")]}
        if code == 0 and not report["captureComplete"]:
            code = 2
    except Exception as error:
        code = 2
        report["traceError"] = str(error)
        raise
    finally:
        sys.settrace(old_trace)
        sys.argv = old_argv
        report["exitCode"] = code
        output = Path(args.trace_out).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return code


if __name__ == "__main__":
    sys.exit(main())
