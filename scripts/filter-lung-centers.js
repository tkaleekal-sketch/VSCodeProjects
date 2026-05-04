const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONCURRENCY = 4;

async function centerHasLungData(browser, center) {
  const page = await browser.newPage();
  try {
    await page.goto('https://hrsa.unos.org/data/view-data-reports/center-data/', { timeout: 30000 });
    await page.getByText('Center data Choose a State').click();

    const stateSelect = page.locator('select').first();
    const stateOptions = await stateSelect.evaluate(sel =>
      Array.from(sel.options).map(o => ({ value: o.value, label: o.text.trim() }))
    );
    const stateOpt = stateOptions.find(o => o.label === center.state);
    if (!stateOpt) return false;

    await stateSelect.selectOption(stateOpt.value);
    await page.getByRole('button', { name: 'Go' }).click();
    await page.waitForSelector('select', { timeout: 10000 });

    await page.getByLabel('Choose Center:').selectOption(center.value);
    await page.getByLabel('Choose Category:').selectOption('2;Transplant');
    await page.getByLabel('Choose Organ:').selectOption('Lung;Lung;8;Organ;Organ');

    await page.getByRole('link', { name: 'Transplants by Recipient Birth Sex' }).click();
    await page.waitForLoadState('networkidle', { timeout: 20000 });

    const reportEl = page.locator('#reportData');
    if (!await reportEl.count()) return false;

    const text = await reportEl.innerText();
    const rows = text.split('\n').map(r => r.trim()).filter(Boolean);

    // Header row contains year columns; first year after "To Date" is the most recent
    const headerRow = rows[0];
    const headerCols = headerRow.split('\t').map(c => c.trim());
    // headerCols[2] = "To Date", headerCols[3] = most recent year with data
    const mostRecentYear = parseInt(headerCols[3], 10);
    return !isNaN(mostRecentYear) && mostRecentYear >= 2020;
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

async function run() {
  const centersPath = path.join(__dirname, '..', 'centers.txt');
  const lines = fs.readFileSync(centersPath, 'utf8').split('\n').slice(1).filter(Boolean);
  const centers = lines.map(line => {
    const [state, label, value] = line.split('\t');
    return { state, label, value };
  });

  console.log(`Checking ${centers.length} centers for Lung transplant data (${CONCURRENCY} parallel workers)...\n`);

  const browser = await chromium.launch({ headless: true });
  const lungCenters = [];
  let done = 0;

  for (let i = 0; i < centers.length; i += CONCURRENCY) {
    const chunk = centers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(c => centerHasLungData(browser, c)));

    results.forEach((hasLung, j) => {
      const c = chunk[j];
      done++;
      process.stdout.write(`\r[${done}/${centers.length}] ${hasLung ? '✓ LUNG' : '✗     '} ${c.label.slice(0, 55).padEnd(55)}`);
      if (hasLung) lungCenters.push(c);
    });
  }

  await browser.close();

  const outLines = [
    'State\tCenter Label\tSelect Value',
    ...lungCenters.map(c => `${c.state}\t${c.label}\t${c.value}`)
  ];
  const outPath = path.join(__dirname, '..', 'lung-centers.txt');
  fs.writeFileSync(outPath, outLines.join('\n'), 'utf8');

  console.log(`\n\nDone. ${lungCenters.length} of ${centers.length} centers have Lung transplant data.`);
  console.log(`Saved to lung-centers.txt\n`);
  lungCenters.forEach(c => console.log(`  [${c.state}] ${c.label}`));
}

run().catch(err => { console.error(err); process.exit(1); });
