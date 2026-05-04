const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONCURRENCY = 4;
const MIN_YEAR = 2005;
const SELECTED_LINES = new Set([3,7,8,13,22,23,26,27,28,30,42,45,49,50,51,52,56,60,65,70,72,82,84,89,90,93,96,97,98,109,119,123,124,125,128,132,134,137,141,145,161,163,164,178,179,190,191,195,198,200,204,208,212,216,217]);

function loadCenters() {
  // Keep header: file line 1 = header, line 2 = first center.
  // SELECTED_LINES contains file line numbers (as seen in the IDE).
  const lines = fs.readFileSync(
    path.join(__dirname, '..', 'lung-centers.txt'), 'utf8'
  ).split('\n').filter(Boolean);

  return lines
    .map((line, i) => {
      const fileLineNum = i + 1;
      if (fileLineNum === 1) return null; // skip header
      if (!SELECTED_LINES.has(fileLineNum)) return null;
      const [state, label, value] = line.split('\t');
      const code = label.split('-TX1')[0].trim();
      return { lineNum: fileLineNum, code, state, label, value };
    })
    .filter(Boolean);
}

const CENTERS = loadCenters();

async function scrapeCenterData(browser, center) {
  const page = await browser.newPage();
  try {
    await page.goto('https://hrsa.unos.org/data/view-data-reports/center-data/', { timeout: 30000 });
    await page.getByText('Center data Choose a State').click();

    const stateSelect = page.locator('select').first();
    const stateOptions = await stateSelect.evaluate(sel =>
      Array.from(sel.options).map(o => ({ value: o.value, label: o.text.trim() }))
    );
    const stateOpt = stateOptions.find(o => o.label === center.state);
    if (!stateOpt) return { code: center.code, label: center.label, yearData: {} };

    await stateSelect.selectOption(stateOpt.value);
    await page.getByRole('button', { name: 'Go' }).click();
    await page.waitForSelector('select', { timeout: 10000 });

    await page.getByLabel('Choose Center:').selectOption(center.value);
    await page.getByLabel('Choose Category:').selectOption('2;Transplant');
    await page.getByLabel('Choose Organ:').selectOption('Lung;Lung;8;Organ;Organ');
    await page.getByRole('link', { name: 'Transplants by Recipient Birth Sex' }).click();
    await page.waitForLoadState('networkidle', { timeout: 20000 });

    const reportEl = page.locator('#reportData');
    if (!await reportEl.count()) return { code: center.code, label: center.label, yearData: {} };

    const text = await reportEl.innerText();
    // Filter empty lines but do NOT trim whole rows — trimming strips the
    // leading blank tab columns from the header, shifting year indices by 2.
    const rows = text.split('\n').filter(r => r.trim());

    // Split each row into cells and trim each cell individually
    const headerCols = rows[0].split('\t').map(c => c.trim());
    // headerCols: ["", "", "To Date", "2026", "2025", "2024", ...]
    const allSexRow = rows.find(r => r.trimStart().startsWith('All Birth Sexes'));
    if (!allSexRow) return { code: center.code, label: center.label, yearData: {} };

    const valueCols = allSexRow.split('\t').map(c => c.trim());
    // valueCols: ["All Birth Sexes", "", "797", "9", "31", "18", ...]
    // Indices now align: headerCols[3]="2026" <-> valueCols[3]="9"

    const yearData = {};
    for (let i = 3; i < headerCols.length; i++) {
      const yr = parseInt(headerCols[i], 10);
      if (!isNaN(yr) && yr >= MIN_YEAR) {
        yearData[yr] = parseInt(valueCols[i], 10) || 0;
      }
    }

    return { code: center.code, label: center.label, yearData };
  } catch (e) {
    console.error(`\nERROR ${center.code}: ${e.message}`);
    return { code: center.code, label: center.label, yearData: {} };
  } finally {
    await page.close();
  }
}

async function run() {
  console.log(`Scraping ${CENTERS.length} centers (${CONCURRENCY} parallel workers, ${MIN_YEAR}-present)...\n`);

  const browser = await chromium.launch({ headless: true });
  const results = [];
  let done = 0;

  for (let i = 0; i < CENTERS.length; i += CONCURRENCY) {
    const chunk = CENTERS.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(c => scrapeCenterData(browser, c)));
    chunkResults.forEach(r => {
      done++;
      const yearCount = Object.keys(r.yearData).length;
      process.stdout.write(`\r[${done}/${CENTERS.length}] ${r.code.padEnd(6)} — ${yearCount} years of data found`);
      results.push(r);
    });
  }

  // Retry any centers that returned 0 years (likely timed out)
  const failed = results.filter(r => Object.keys(r.yearData).length === 0);
  if (failed.length > 0) {
    console.log(`\n\nRetrying ${failed.length} timed-out centers one at a time...`);
    for (const r of failed) {
      const center = CENTERS.find(c => c.code === r.code);
      const retry = await scrapeCenterData(browser, center);
      const yearCount = Object.keys(retry.yearData).length;
      console.log(`  ${retry.code.padEnd(6)} — ${yearCount} years`);
      Object.assign(r, retry);
    }
  }

  await browser.close();
  console.log('\n\nBuilding CSV...');

  // Collect all years across all centers, sorted descending (most recent first)
  const allYears = [...new Set(
    results.flatMap(r => Object.keys(r.yearData).map(Number))
  )].sort((a, b) => b - a);

  // Build CSV — centers as rows, years as columns
  const header = ['Code', 'Center Name', ...allYears];
  const dataRows = results.map(r => [
    r.code,
    `"${r.label}"`,
    ...allYears.map(yr => r.yearData[yr] !== undefined ? r.yearData[yr] : '')
  ]);

  const csvLines = [
    header.join(','),
    ...dataRows.map(row => row.join(','))
  ];

  const outPath = path.join(__dirname, '..', 'lung-transplants.csv');
  fs.writeFileSync(outPath, csvLines.join('\n'), 'utf8');

  console.log(`Done. CSV saved to lung-transplants.csv`);
  console.log(`  Rows: ${allYears.length} years (${allYears[0]}–${allYears[allYears.length - 1]})`);
  console.log(`  Columns: ${results.length} centers`);
}

run().catch(err => { console.error(err); process.exit(1); });
