# AGENTS.md

This file provides guidance to Codex and other coding agents when working with code in this repository.
`CLAUDE.md` is a byte-for-byte mirror of this file (only the first sentence differs) for Claude Code — keep both in sync when editing.

## Commands

```bash
# Install dependencies
npm install
npx playwright install

# Run a single Playwright test file
npx playwright test tests/alua.spec.js --headed

# Open the HTML test report
npx playwright show-report

# Routine data refresh (run these two to update lung-transplants.csv and the Excel export)
node scripts/scrape-lung-data.js
node scripts/generate-excel.js

# Full pipeline refresh (only needed when transplant centers may have changed)
npx playwright test tests/list-centers.spec.js
node scripts/filter-lung-centers.js
node scripts/scrape-lung-data.js
node scripts/generate-excel.js
```

Avoid bare `npx playwright test` with no file: it runs every spec, including `list-centers.spec.js` (a ~1.3 min live scrape that overwrites `centers.txt`) and the Playwright boilerplate `tests/example.spec.js`. The GitHub Actions workflow in `.github/workflows/` does exactly that on every push — it is the stock Playwright CI template and has not been tailored to this project.

## Architecture

This project scrapes lung transplant volumes from the HRSA UNOS center data portal (`hrsa.unos.org/data/view-data-reports/center-data/`) for a curated set of 54 US lung transplant centers, writes a CSV, and exports a datestamped Excel report. The CSV also feeds a PowerPoint analytics deck kept in `Reports/` (see "Analytics deck" below).

### Two types of scripts

**`tests/` — Playwright test runner scripts** (use `npx playwright test <file>`)
- `list-centers.spec.js` — scrapes all transplant centers state-by-state and writes `centers.txt` (tab-separated: State, Center Label, Select Value)
- `alua.spec.js` — single-center proof-of-concept for ALUA
- `example.spec.js` — untouched Playwright boilerplate (hits playwright.dev); not part of the project

**`scripts/` — standalone Node scripts** (use `node scripts/...`, run directly with the `playwright` npm package, not the test runner)
- `filter-lung-centers.js` — reads `centers.txt`, checks each center for active lung transplant data (most recent year ≥ 2020), writes `lung-centers.txt`
- `scrape-lung-data.js` — reads `lung-centers.txt`, scrapes "Transplants by Recipient Birth Sex → All Birth Sexes" for the 54 codes in `SELECTED_CODES`, writes `lung-transplants.csv`
- `generate-excel.js` — reads `lung-transplants.csv`, produces a datestamped `.xlsx` in `Reports/` with a merged title heading and frozen panes (uses `exceljs`)
- `diagnose-center.js` — one-off debugging tool, not part of the main pipeline

### Data pipeline

```
list-centers.spec.js  →  centers.txt  (all 350 transplant centers)
        ↓
filter-lung-centers.js  →  lung-centers.txt  (217 rows / 216 unique active lung centers, file line 1 = header)
        ↓
scrape-lung-data.js  →  lung-transplants.csv  (54 selected centers × years 2026→2005)
        ↓
generate-excel.js  →  Reports/lung-transplants_YYYYMMDD.xlsx
```

**When to run each step:**
- **Steps 3–4 only (`scrape-lung-data.js` + `generate-excel.js`)** — routine data refresh. `lung-centers.txt` is stable; transplant center rosters change infrequently. Run this for any regular update (~2 min).
- **Steps 1–4 (full pipeline)** — only needed when transplant centers may have been added or removed (e.g., after a HRSA roster update). Steps 1 and 2 together take ~3–4 minutes.

**Data currency (as of the last refresh, 2026-10-26):** `centers.txt` and `lung-centers.txt` were last regenerated 2026-05-07. `lung-transplants.csv` was re-scraped 2026-10-26; the 2026 column covers Jan 1–Sep 30, 2026 (OPTN data as of Oct 25, 2026). HRSA publishes with roughly a one-month lag, so the current-year column is always partial.

### Key implementation details

**Center selection in `scrape-lung-data.js`:** `SELECTED_CODES` holds 54 stable HRSA center codes, such as `ALUA` and `CACS`. The comment in the script says `Reports/lung-transplants.xlsx` is the authoritative list; update that file first, then copy the Code column into `SELECTED_CODES`. Do not select centers by line number from `lung-centers.txt`; that file can be regenerated in a different order and line-based selection can scrape the wrong hospitals. The script throws if any selected code is missing from `lung-centers.txt`.

**Candidate additions (open item from the Oct 2026 deck work):** MUSC, Methodist Memphis, Jewish Louisville, Cleveland Clinic FL and Wellstar MCG would complete the Southeast peer set. Not yet added to `SELECTED_CODES`.

**Duplicate code in the roster:** the HRSA portal lists `NJSB` (Saint Barnabas) under both New Jersey and South Dakota, so `centers.txt` and `lung-centers.txt` carry it twice (217 rows, 216 unique codes). `loadCenters()` keys a Map by code, so the later (South Dakota) row wins — harmless today because `NJSB` is not selected, but keep it in mind if it ever is.

**Table parsing quirk:** The HRSA report table (`#reportData`) has two leading blank tab-separated columns in the header row. Do NOT `.trim()` the full row before splitting — only trim individual cells after splitting. Trimming the full row strips the leading blank columns and shifts all year indices by 2, causing years to be mis-labeled. Header index 3 = most recent year; the matching value is at index 3 of the "All Birth Sexes" row.

**Navigation flow for every scrape:** State dropdown → Go button → Center dropdown → Category (`2;Transplant`) → Organ (`Lung;Lung;8;Organ;Organ`) → click "Transplants by Recipient Birth Sex" link → wait for `#reportData`.

**Parallelism:** Scripts run 4 concurrent browser pages (`CONCURRENCY = 4`). If page timeouts occur, the scraper automatically retries failed centers (0 years returned) sequentially after the initial pass.

**Year floor:** `MIN_YEAR = 2005`; earlier years are dropped from the CSV and Excel output.

### Output files

| File | Description |
|------|-------------|
| `centers.txt` | All 350 HRSA transplant centers (tab-separated; 351 lines incl. header) |
| `lung-centers.txt` | 216 unique centers with active lung data since 2020 (217 rows + header; `NJSB` duplicated, see above) |
| `lung-transplants.csv` | Final output: 54 centers as rows, years as columns (descending 2026→2005), "All Birth Sexes" count only |
| `Reports/lung-transplants_YYYYMMDD.xlsx` | Datestamped Excel export of `lung-transplants.csv` with formatted heading and frozen panes (`20260511`, `20261026` so far) |

### Analytics deck and other `Reports/` contents

`Reports/` also holds hand-built deliverables that are **not** produced by any script in this repo:

| File | What it is |
|------|------------|
| `LungTransplant_Analytics_2026.pptx` | April 2026 original deck (18 slides) |
| `LungTransplant_Analytics_2026_Oct2026_update.pptx` / `.pdf` | October 2026 update (20 slides). Built from `lung-transplants.csv` plus externally supplied SRTR PSR (Jul 2026), center rolling 90-day/1-yr reports (Oct 4, 2026), Jan–Aug 2026 offer-acceptance report, and the UNOS Benchmark Report (Oct 2026). **Start the next refresh from this file, not the April one.** Build scripts were session-scratch only and are not in the repo. |
| `lung-transplants.xlsx` | Authoritative hand-maintained list of selected centers (source for `SELECTED_CODES`) |
| `lung-transplants.numbers`, `Ltx Analysis.docx`, `PEGJ_baseline characteristics.xlsx`, `table4_nutrition_trajectories.numbers`, `DR_101721_…numbers` | Unrelated or adjacent analysis files parked here (several belong to the GI/PEG-J research project). Do not treat them as pipeline inputs or outputs. |

SRTR PDF links redirect to `srtr.hrsa.gov` and have returned 404 on direct fetch; ask the user to upload the newest PSR / rolling reports rather than scraping them. Next SRTR surveillance checkpoint: the Jan 2027 report.

### Supporting notes

- `claudesummary.txt` — session-portable project summary (kept current alongside this file)
- `claudeprompt1.1.txt` — historical notes from the May 7, 2026 session; counts in it (55 centers) are superseded by this file
