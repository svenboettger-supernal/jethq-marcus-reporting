# Marcus — Accuracy & Performance Report

An interactive, password-gated analytics dashboard reporting on the accuracy and performance of **Marcus**, the AI Employee (built by Supernal) that processes JetNet aircraft update alerts on behalf of JetHQ. Audience: JetHQ leadership.

**Live**: https://svenboettger-supernal.github.io/jethq-marcus-reporting/

## Access

The site is gated by a client-side SHA-256 password check. This is access friction, not authentication.

- Password: `ainative`
- Hash (embedded in `docs/assets/js/lock.js`): `0c3a0b2dd2dc0dbc5277d59904abebe8ff3424fe14156fdef892567f35d67c1d`
- Session: after one successful unlock the dashboard stays open for the rest of the browser session (`sessionStorage`).

To change the password, generate a new hash:

```bash
echo -n "new-password-here" | shasum -a 256
```

…and update `PASSWORD_HASH` in `docs/assets/js/lock.js` and the cleartext above.

## What this dashboard contains

A single-page, static report covering:

- **Headline** — 99.21% accuracy (126 / 127) on the curated post-QC scorecard, with surface-area KPIs (updates processed, unique aircraft touched, distinct classifications, uplift vs. Round 1).
- **Trajectory** — accuracy across the four validation rounds (Round 1 → Round 2 → recent Update Validations → Final), strict and weighted.
- **Daily volume** — every update Marcus made in the most recent window, stacked by top classifications, with a date-range zoomer.
- **Classification breakdown** — what kinds of updates Marcus is making. Click any bar to filter the whole page.
- **Accuracy by classification** — strict accuracy per classification with sample sizes; classifications with fewer than five validated samples are flagged.
- **Where errors hide** — four small charts: accuracy by hour, by day of week, by date, and the classifier's confidence-score distribution.
- **Why flags get reverted** — narrative cards explaining the two recurring patterns (JetNet sync lag and edge conditions / notes clarity) with real examples from the data.
- **Validation explorer** — every validated row across all rounds. Search, filter, sort, expand for full notes and hub links, export filtered CSV.
- **Classifier rules** — the 718-row classifier reference table with search and pagination.
- **Methodology & caveats** — what each verdict means, sampling biases, and what the headline number does and does not claim.

## Architecture

Plain HTML + CSS + ES modules with [ECharts](https://echarts.apache.org/) loaded from a CDN. No backend, no build step.

```
jethq-marcus-reporting/
├── README.md
├── data/
│   └── source/
│       └── Marcus_Evaluation.xlsx       (gitignored)
├── scripts/
│   ├── build_data.py                    (Excel → JSON preprocessor)
│   └── requirements.txt
├── docs/                                (GitHub Pages root)
│   ├── index.html
│   ├── assets/
│   │   ├── css/{tokens.css,app.css}
│   │   ├── js/{lock.js,app.js}
│   │   └── img/favicon.svg
│   └── data/
│       └── marcus.json                  (generated; committed)
└── .gitignore
```

GitHub Pages serves from `main` → `/docs`. The raw spreadsheet is **not** in the repo; only the cleaned `marcus.json` is.

## Refreshing the data

When JetHQ delivers a new `Marcus_Evaluation.xlsx`:

```bash
# 1. drop the new file in
cp "/path/to/new/Marcus Evaluation.xlsx" data/source/Marcus_Evaluation.xlsx

# 2. rebuild the JSON
python3 -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/build_data.py

# 3. commit and push — Pages will redeploy automatically
git add docs/data/marcus.json
git commit -m "Refresh data $(date +%Y-%m-%d)"
git push
```

The preprocessor prints a human-readable summary so you can sanity-check the headline number before you commit.

## Methodology in one paragraph

The workbook contains five sheets: three time-ordered validation rounds (Round 1 in January, Round 2 in February–March, and Update Validations in March–May), plus a curated post-QC `Final List` (127 rows) and a classifier-rules reference (`Classifications`, 718 rows). For each validated row, a JetHQ researcher gave a verdict (Correct / Half Correct / Incorrect), and Supernal (Jens) re-reviewed every flag. The headline 99.21% is strict accuracy on the Final List (126 Correct of 127). For other charts, "strict" accuracy counts Half Correct as wrong; "weighted" accuracy gives Half Correct half-credit. Sampling is non-random — validated rows are the rows researchers chose to flag — so per-classification accuracy describes flagged outcomes, not Marcus's behavior overall.

## Decisions worth knowing

- **Year inference.** Times in the workbook are bare `HH:MM DD Mon` strings without a year. Jens' notes reference event dates in this calendar year (e.g. `3/19/26`) and the rounds are chronologically contiguous, so the preprocessor treats all timestamps as 2026. If a future export crosses a year boundary, update `INFERRED_YEAR` in `scripts/build_data.py`.
- **Validation column cleanup.** Round 2 has status-string leakage (`On Market`, `sold`, `for-sale`, …) in the `Validation` column; Round 1 and Update Validations have numeric leakage. The preprocessor filters strictly to `Correct / Half Correct / Incorrect / Not Correct` (the lone `Not Correct` row is treated as `Incorrect`).
- **Reference data size.** The brief estimated ~1,000 classifier rules; the actual sheet has 718. Numbers on the page reflect what's in the file.
- **No production data leakage.** The source workbook is git-ignored. The published `docs/data/marcus.json` does contain validated-row content (alert text, aircraft make/model/serial, researcher notes, hub links) — that's the whole point of the report. If anything in there is sensitive, edit `scripts/build_data.py` to redact it and rerun.
- **Charts vs. brand.** Charts use the Supernal visualization palette but keep editorial typography minimal — restraint over decoration. Pills are reserved for status badges; buttons use `rounded-md` for dashboard restraint.

## Deployment

1. Push to `main`.
2. GitHub → Repository settings → Pages → Build and deployment → Source = "Deploy from a branch", Branch = `main`, Folder = `/docs`. If not yet configured, this is a one-click setting.

This repository's Pages settings are configured by the initial deploy script (`gh api`) in the deploy commit; if you cloned fresh and Pages isn't enabled, do the click above.

## Built by

Supernal · sven.boettger@getsupernal.ai
