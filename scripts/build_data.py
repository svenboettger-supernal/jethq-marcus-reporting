"""Build docs/data/marcus.json from Marcus_Evaluation.xlsx.

Run: python scripts/build_data.py
Reads:  data/source/Marcus_Evaluation.xlsx
Writes: docs/data/marcus.json
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "source" / "Marcus_Evaluation.xlsx"
OUT = ROOT / "docs" / "data" / "marcus.json"

# All timestamps in the workbook are bare "HH:MM DD Mon" strings without year.
# Rounds run contiguously: R1 (Jan) -> R2 (Feb-Mar) -> Update Validations (Mar-May).
# Jens' notes reference event dates like "3/19/26", which puts the data in 2026.
INFERRED_YEAR = 2026

VALID_VERDICTS = {"Correct", "Half Correct", "Incorrect", "Not Correct"}
# Normalize "Not Correct" -> "Incorrect" (single Round 2 row).
VERDICT_NORMALIZE = {"Not Correct": "Incorrect"}
ALLOWED_NEW_MARKET_STATUS_GARBAGE = {"Good", "Ok", "Poor", "Score"}


def parse_time(value: str | float, year: int = INFERRED_YEAR) -> str | None:
    """Parse 'HH:MM DD Mon' -> ISO 8601 string. Returns None if unparseable."""
    if pd.isna(value):
        return None
    s = str(value).strip()
    m = re.match(r"^(\d{1,2}):(\d{2})\s+(\d{1,2})\s+([A-Za-z]+)$", s)
    if not m:
        return None
    hh, mm, dd, mon = m.groups()
    try:
        dt = datetime.strptime(f"{dd} {mon} {year} {hh}:{mm}", "%d %b %Y %H:%M")
        return dt.isoformat()
    except ValueError:
        return None


def normalize_verdict(value) -> str | None:
    if pd.isna(value):
        return None
    s = str(value).strip()
    if s not in VALID_VERDICTS:
        return None
    return VERDICT_NORMALIZE.get(s, s)


def safe_str(value) -> str:
    if pd.isna(value):
        return ""
    s = str(value).strip()
    if s.lower() in {"nan", "nat", "none"}:
        return ""
    return s


def clean_market_status(value) -> str:
    s = safe_str(value)
    if s in ALLOWED_NEW_MARKET_STATUS_GARBAGE:
        return ""
    return s


def load_sheets() -> dict[str, pd.DataFrame]:
    if not SRC.exists():
        print(f"ERROR: missing source file {SRC}", file=sys.stderr)
        sys.exit(1)
    xl = pd.ExcelFile(SRC)
    return {name: pd.read_excel(xl, sheet_name=name) for name in xl.sheet_names}


def build_round_summary(name: str, df: pd.DataFrame) -> dict:
    df = df.copy()
    df["_verdict"] = df["Validation"].apply(normalize_verdict)
    validated = df[df["_verdict"].notna()]
    counts = Counter(validated["_verdict"])
    n = len(validated)
    correct = counts.get("Correct", 0)
    half = counts.get("Half Correct", 0)
    incorrect = counts.get("Incorrect", 0)
    strict_accuracy = (correct / n * 100) if n else 0.0
    weighted_accuracy = ((correct + 0.5 * half) / n * 100) if n else 0.0

    times = [parse_time(t) for t in df["Time"].dropna().tolist()]
    times = [t for t in times if t]
    return {
        "name": name,
        "rows_total": int(len(df)),
        "validated": int(n),
        "correct": int(correct),
        "half_correct": int(half),
        "incorrect": int(incorrect),
        "strict_accuracy_pct": round(strict_accuracy, 2),
        "weighted_accuracy_pct": round(weighted_accuracy, 2),
        "flag_rate_pct": round(((half + incorrect) / n * 100) if n else 0.0, 2),
        "time_range": {
            "start": min(times) if times else None,
            "end": max(times) if times else None,
        },
    }


def build_validated_rows(rounds: list[tuple[str, pd.DataFrame, str]]) -> list[dict]:
    rows: list[dict] = []
    rid = 0
    for round_label, df, notes_col in rounds:
        df = df.copy()
        df["_verdict"] = df["Validation"].apply(normalize_verdict)
        subset = df[df["_verdict"].notna()]
        for _, r in subset.iterrows():
            rid += 1
            rows.append(
                {
                    "id": f"v{rid:04d}",
                    "round": round_label,
                    "time": parse_time(r.get("Time")),
                    "raw_time": safe_str(r.get("Time")),
                    "make": safe_str(r.get("Make")),
                    "model": safe_str(r.get("Model")),
                    "serial": safe_str(r.get("Serial")),
                    "hub_link": safe_str(r.get("Hub Link")),
                    "alert": safe_str(r.get("Alert")),
                    "classified_as": safe_str(r.get("Classified as")),
                    "confidence": (
                        float(r["Confidence"])
                        if "Confidence" in r and pd.notna(r.get("Confidence"))
                        else None
                    ),
                    "reasoning": safe_str(r.get("Reasoning")),
                    "new_value_price": safe_str(r.get("New Value/Price")),
                    "new_status": safe_str(r.get("New Status")),
                    "new_market_status": clean_market_status(r.get("New Market Status")),
                    "verdict": r["_verdict"],
                    "jethq_notes": safe_str(r.get(notes_col)),
                    "jens_notes": safe_str(r.get("Jens' Notes")),
                }
            )
    return rows


def build_daily_volume(df_uv: pd.DataFrame) -> list[dict]:
    df = df_uv.copy()
    df["_dt"] = df["Time"].apply(parse_time)
    df = df[df["_dt"].notna()].copy()
    df["_date"] = df["_dt"].str.slice(0, 10)
    df["_class"] = df["Classified as"].apply(safe_str).replace("", "unclassified")
    grouped = df.groupby(["_date", "_class"]).size().reset_index(name="count")
    out: dict[str, dict] = defaultdict(lambda: {"date": "", "total": 0, "by_class": {}})
    for _, r in grouped.iterrows():
        date = r["_date"]
        cls = r["_class"]
        out[date]["date"] = date
        out[date]["total"] += int(r["count"])
        out[date]["by_class"][cls] = int(r["count"])
    return [out[k] for k in sorted(out.keys())]


def build_classification_breakdown(df_uv: pd.DataFrame) -> list[dict]:
    df = df_uv.copy()
    df["_class"] = df["Classified as"].apply(safe_str).replace("", "unclassified")
    counts = df["_class"].value_counts()
    return [{"classification": k, "count": int(v)} for k, v in counts.items()]


def build_classification_accuracy(validated_rows: list[dict]) -> list[dict]:
    by_class: dict[str, dict] = {}
    for row in validated_rows:
        cls = row["classified_as"] or "unclassified"
        bucket = by_class.setdefault(
            cls, {"classification": cls, "validated": 0, "correct": 0, "half": 0, "incorrect": 0}
        )
        bucket["validated"] += 1
        if row["verdict"] == "Correct":
            bucket["correct"] += 1
        elif row["verdict"] == "Half Correct":
            bucket["half"] += 1
        else:
            bucket["incorrect"] += 1
    out = []
    for cls, b in by_class.items():
        n = b["validated"]
        b["strict_accuracy_pct"] = round((b["correct"] / n * 100) if n else 0.0, 2)
        b["weighted_accuracy_pct"] = round(((b["correct"] + 0.5 * b["half"]) / n * 100) if n else 0.0, 2)
        b["low_sample"] = n < 5
        out.append(b)
    out.sort(key=lambda x: (-x["strict_accuracy_pct"], -x["validated"]))
    return out


def build_temporal_accuracy(validated_rows: list[dict]) -> dict:
    by_hour = defaultdict(lambda: {"correct": 0, "half": 0, "incorrect": 0, "n": 0})
    by_dow = defaultdict(lambda: {"correct": 0, "half": 0, "incorrect": 0, "n": 0})
    by_date = defaultdict(lambda: {"correct": 0, "half": 0, "incorrect": 0, "n": 0})
    for row in validated_rows:
        if not row["time"]:
            continue
        dt = datetime.fromisoformat(row["time"])
        h = dt.hour
        dow = dt.weekday()  # 0 Mon - 6 Sun
        d = dt.strftime("%Y-%m-%d")
        for bucket_key, bucket in [(h, by_hour[h]), (dow, by_dow[dow]), (d, by_date[d])]:
            bucket["n"] += 1
            if row["verdict"] == "Correct":
                bucket["correct"] += 1
            elif row["verdict"] == "Half Correct":
                bucket["half"] += 1
            else:
                bucket["incorrect"] += 1

    def pack(bucket: dict, key) -> dict:
        n = bucket["n"]
        return {
            "key": key,
            "n": n,
            "correct": bucket["correct"],
            "half": bucket["half"],
            "incorrect": bucket["incorrect"],
            "strict_accuracy_pct": round((bucket["correct"] / n * 100) if n else 0.0, 2),
            "weighted_accuracy_pct": round(((bucket["correct"] + 0.5 * bucket["half"]) / n * 100) if n else 0.0, 2),
        }

    return {
        "by_hour": [pack(by_hour[h], h) for h in sorted(by_hour.keys())],
        "by_day_of_week": [pack(by_dow[d], d) for d in sorted(by_dow.keys())],
        "by_date": [pack(by_date[d], d) for d in sorted(by_date.keys())],
    }


def build_confidence_distribution(df_class: pd.DataFrame) -> dict:
    """Histogram of confidence scores in the Classifications sheet, plus stats."""
    series = df_class["Confidence"].dropna().astype(float)
    bins = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.93, 0.95, 0.97, 0.99, 1.01]
    labels = ["<0.60", "0.60-0.70", "0.70-0.80", "0.80-0.85", "0.85-0.90",
              "0.90-0.93", "0.93-0.95", "0.95-0.97", "0.97-0.99", "0.99+"]
    cats = pd.cut(series, bins=bins, labels=labels, right=False, include_lowest=True)
    counts = cats.value_counts().reindex(labels, fill_value=0)
    return {
        "mean": round(float(series.mean()), 4),
        "median": round(float(series.median()), 4),
        "min": round(float(series.min()), 4),
        "max": round(float(series.max()), 4),
        "buckets": [{"label": k, "count": int(v)} for k, v in counts.items()],
    }


def build_classifications_table(df_class: pd.DataFrame) -> list[dict]:
    df = df_class.copy()
    rows = []
    for i, r in df.iterrows():
        rows.append(
            {
                "id": f"c{i:04d}",
                "alert": safe_str(r.get("Alert")),
                "classified_as": safe_str(r.get("Classified as")),
                "confidence": float(r["Confidence"]) if pd.notna(r.get("Confidence")) else None,
                "reasoning": safe_str(r.get("Reasoning")),
            }
        )
    return rows


def pick_narrative_examples(validated_rows: list[dict]) -> list[dict]:
    """Hand-pick two illustrative cases from validated rows with notes filled.

    One for JetNet sync lag and one for notes-clarity / edge condition.
    Falls back to the first matching examples if hand picks aren't present.
    """
    sync_keywords = ("at the time", "later same day", "sync", "JETNET", "was updated")
    notes_keywords = ("prefer", "guidance", "rule", "policy", "we have to", "kept", "edge", "could be clearer", "explain")

    candidates = [
        r for r in validated_rows
        if r["verdict"] == "Correct" and r["jethq_notes"] and r["jens_notes"]
    ]

    def score(row, keywords):
        return sum(1 for k in keywords if k.lower() in row["jens_notes"].lower())

    sync_examples = sorted(candidates, key=lambda r: -score(r, sync_keywords))
    notes_examples = sorted(candidates, key=lambda r: -score(r, notes_keywords))

    sync_pick = sync_examples[0] if sync_examples else None
    notes_pick = None
    for cand in notes_examples:
        if cand and cand is not sync_pick:
            notes_pick = cand
            break

    out = []
    if sync_pick:
        out.append({"theme": "JetNet sync lag", "row": sync_pick})
    if notes_pick:
        out.append({"theme": "Edge conditions and notes clarity", "row": notes_pick})
    return out


def main() -> None:
    sheets = load_sheets()
    df_final = sheets["Final List of Validations"]
    df_uv = sheets["Update Validations"]
    df_r2 = sheets["Validations Round 2"]
    df_r1 = sheets["Validations Round 1"]
    df_class = sheets["Classifications"]

    # Three review rounds. "Update Validations" is Marcus's running log of every update —
    # not a review round. Its `Validation` column holds the raw researcher verdicts for
    # Round 3 rows, before Supernal's resolution pass; Round 3 itself ("Final List of
    # Validations") holds Supernal's post-review verdicts.
    rounds = [
        ("Round 1", df_r1, "Notes"),
        ("Round 2", df_r2, "Notes"),
        ("Round 3", df_final, "JetHQ Notes"),
    ]

    round_summaries = [build_round_summary(name, df) for name, df, _ in rounds]
    validated_rows = build_validated_rows(rounds)

    # Round 3 researcher-pre-review numbers come from UV's validated subset.
    uv_initial = build_round_summary("Round 3 (researcher pre-review)", df_uv)

    # Narrative examples come from UV rows where the raw researcher verdict differs
    # from the final Supernal verdict — these are the flags that reverted.
    uv_validated_rows = build_validated_rows([("Update Validations (raw researcher verdicts)", df_uv, "JetHQ Notes")])
    narrative = pick_narrative_examples(uv_validated_rows)

    # Headline numbers come from Round 3 (curated post-review).
    r3_summary = next(r for r in round_summaries if r["name"] == "Round 3")
    r1_summary = next(r for r in round_summaries if r["name"] == "Round 1")
    improvement_pp = round(r3_summary["strict_accuracy_pct"] - r1_summary["strict_accuracy_pct"], 2)

    distinct_aircraft = df_uv["Id"].dropna().nunique() if "Id" in df_uv.columns else 0
    distinct_classes_uv = (
        df_uv["Classified as"].dropna().nunique() if "Classified as" in df_uv.columns else 0
    )
    distinct_classes_all = df_class["Classified as"].dropna().nunique()

    # Researcher-to-Supernal flag resolution, expressed at the sample level.
    # The researcher pass and the Supernal pass each reviewed the same 127 sample rows
    # (UV-validated subset == Round 3 row set). Compare the verdict mixes directly.
    researcher_correct = uv_initial["correct"]
    researcher_flags = uv_initial["half_correct"] + uv_initial["incorrect"]
    supernal_correct = r3_summary["correct"]
    supernal_incorrect = r3_summary["incorrect"] + r3_summary["half_correct"]
    flag_resolution = {
        "sample_size": uv_initial["validated"],
        "researcher_correct": researcher_correct,
        "researcher_flagged": researcher_flags,
        "supernal_correct": supernal_correct,
        "supernal_confirmed_problems": supernal_incorrect,
        "flags_reverted_to_correct": researcher_flags - supernal_incorrect,
        "researcher_strict_accuracy_pct": uv_initial["strict_accuracy_pct"],
        "supernal_strict_accuracy_pct": r3_summary["strict_accuracy_pct"],
    }

    total_updates = int(len(df_uv))

    payload = {
        "meta": {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "inferred_year": INFERRED_YEAR,
            "source_file": str(SRC.name),
            "headline_label": "Marcus accuracy",
        },
        "kpis": {
            "overall_accuracy_pct": r3_summary["strict_accuracy_pct"],
            "overall_numerator": r3_summary["correct"],
            "overall_denominator": r3_summary["validated"],
            "total_updates_log": total_updates,
            "total_validated_all_rounds": sum(r["validated"] for r in round_summaries),
            "distinct_classifications_uv": int(distinct_classes_uv),
            "distinct_classifications_all": int(distinct_classes_all),
            "distinct_aircraft_uv": int(distinct_aircraft),
            "improvement_pp_vs_round_1": improvement_pp,
            "log_window": {
                "start": min(parse_time(t) for t in df_uv["Time"].dropna() if parse_time(t)),
                "end": max(parse_time(t) for t in df_uv["Time"].dropna() if parse_time(t)),
            },
        },
        "round_summaries": round_summaries,
        "round_3_initial": uv_initial,
        "flag_resolution": flag_resolution,
        "daily_volume": build_daily_volume(df_uv),
        "classification_breakdown": build_classification_breakdown(df_uv),
        "classification_accuracy": build_classification_accuracy(validated_rows),
        "temporal_accuracy": build_temporal_accuracy(validated_rows),
        "confidence_distribution": build_confidence_distribution(df_class),
        "validated_rows": validated_rows,
        "classifications": build_classifications_table(df_class),
        "narrative_examples": narrative,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(payload, f, separators=(",", ":"), ensure_ascii=False)

    # Print human summary
    print(f"Wrote {OUT} ({os.path.getsize(OUT):,} bytes)")
    print("-- Round summaries --")
    for r in round_summaries:
        print(
            f"  {r['name']:<22} rows={r['rows_total']:>5}  validated={r['validated']:>3}  "
            f"strict={r['strict_accuracy_pct']:>5.2f}%  weighted={r['weighted_accuracy_pct']:>5.2f}%  "
            f"range=[{r['time_range']['start']} -> {r['time_range']['end']}]"
        )
    print("-- Headline KPIs --")
    for k, v in payload["kpis"].items():
        print(f"  {k}: {v}")
    print(f"-- Validated rows total: {len(validated_rows)}")
    print(f"-- Daily-volume points: {len(payload['daily_volume'])}")
    print(f"-- Classifications: {len(payload['classifications'])}")
    print(f"-- Narrative examples: {len(narrative)}")


if __name__ == "__main__":
    main()
