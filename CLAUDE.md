# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install
npx playwright install

# Run a single Playwright test file
npx playwright test tests/alua.spec.js --headed

# Run all Playwright tests
npx playwright test

# Open the HTML test report
npx playwright show-report

# Routine data refresh (run this to update lung-transplants.csv)
node scripts/scrape-lung-data.js

# Full pipeline refresh (only needed when transplant centers may have changed)
npx playwright test tests/list-centers.spec.js
node scripts/filter-lung-centers.js
node scripts/scrape-lung-data.js
```

## Architecture

This project scrapes lung transplant data from the HRSA UNOS center data portal (`hrsa.unos.org/data/view-data-reports/center-data/`) and produces a CSV for analysis.

### Two types of scripts

**`tests/` — Playwright test runner scripts** (use `npx playwright test`)
- `list-centers.spec.js` — scrapes all transplant centers state-by-state and writes `centers.txt` (tab-separated: State, Center Label, Select Value)
- `alua.spec.js` — single-center proof-of-concept for ALUA

**`scripts/` — standalone Node scripts** (use `node scripts/...`, run directly with the `playwright` npm package, not the test runner)
- `filter-lung-centers.js` — reads `centers.txt`, checks each center for active lung transplant data (most recent year ≥ 2020), writes `lung-centers.txt`
- `scrape-lung-data.js` — reads `lung-centers.txt`, scrapes "Transplants by Recipient Birth Sex → All Birth Sexes" for a selected subset of centers, writes `lung-transplants.csv`
- `diagnose-center.js` — one-off debugging tool, not part of the main pipeline

### Data pipeline

```
list-centers.spec.js  →  centers.txt  (all 350 transplant centers)
        ↓
filter-lung-centers.js  →  lung-centers.txt  (216 active lung centers, file line 1 = header)
        ↓
scrape-lung-data.js  →  lung-transplants.csv
```

**When to run each step:**
- **Step 3 only (`scrape-lung-data.js`)** — routine data refresh. `lung-centers.txt` is stable; transplant center rosters change infrequently. Run this for any regular update.
- **Steps 1–3 (full pipeline)** — only needed when transplant centers may have been added or removed (e.g., after a HRSA roster update). Steps 1 and 2 together take ~3–4 minutes; Step 3 takes ~2 minutes.

### Key implementation details

**Center selection in `scrape-lung-data.js`:** `SELECTED_LINES` contains **file line numbers** from `lung-centers.txt` as seen in a text editor (line 1 = header, line 2 = first center). This is an important convention — do not confuse with 0-indexed or header-skipped numbering.

**Table parsing quirk:** The HRSA report table (`#reportData`) has two leading blank tab-separated columns in the header row. Do NOT `.trim()` the full row before splitting — only trim individual cells after splitting. Trimming the full row strips the leading blank columns and shifts all year indices by 2, causing years to be mis-labeled.

**Navigation flow for every scrape:** State dropdown → Go button → Center dropdown → Category (`2;Transplant`) → Organ (`Lung;Lung;8;Organ;Organ`) → click "Transplants by Recipient Birth Sex" link → wait for `#reportData`.

**Parallelism:** Scripts run 4 concurrent browser pages (`CONCURRENCY = 4`). If page timeouts occur, the scraper automatically retries failed centers sequentially after the initial pass.

### Output files

| File | Description |
|------|-------------|
| `centers.txt` | All 350 HRSA transplant centers (tab-separated) |
| `lung-centers.txt` | 216 centers with active lung data since 2020 (file line numbers used for selection) |
| `lung-transplants.csv` | Final output: centers as rows, years as columns (descending 2026→2005), "All Birth Sexes" count only |
