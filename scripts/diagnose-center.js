// Dumps raw #reportData table text for a few centers to see what no-lung data looks like
const { chromium } = require('playwright');

async function dumpReport(centerLabel, centerValue, state) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('https://hrsa.unos.org/data/view-data-reports/center-data/', { timeout: 30000 });
    await page.getByText('Center data Choose a State').click();

    const stateSelect = page.locator('select').first();
    const stateOptions = await stateSelect.evaluate(sel =>
      Array.from(sel.options).map(o => ({ value: o.value, label: o.text.trim() }))
    );
    const stateOpt = stateOptions.find(o => o.label === state);
    await stateSelect.selectOption(stateOpt.value);
    await page.getByRole('button', { name: 'Go' }).click();
    await page.waitForSelector('select', { timeout: 10000 });

    await page.getByLabel('Choose Center:').selectOption(centerValue);
    await page.getByLabel('Choose Category:').selectOption('2;Transplant');
    await page.getByLabel('Choose Organ:').selectOption('Lung;Lung;8;Organ;Organ');
    await page.getByRole('link', { name: 'Transplants by Recipient Birth Sex' }).click();
    await page.waitForLoadState('networkidle', { timeout: 20000 });

    const url = page.url();
    const reportEl = page.locator('#reportData');
    const exists = await reportEl.count();

    console.log(`\n=== ${centerLabel} ===`);
    console.log(`URL: ${url}`);
    console.log(`#reportData exists: ${exists}`);

    if (exists) {
      const text = await reportEl.innerText();
      // Print just first 3 lines to see structure
      const lines = text.split('\n').filter(l => l.trim()).slice(0, 5);
      console.log('First 5 lines:');
      lines.forEach((l, i) => console.log(`  [${i}] ${JSON.stringify(l)}`));
    }
  } finally {
    await browser.close();
  }
}

(async () => {
  // Known lung center
  await dumpReport(
    'ALUA University of Alabama',
    'ALUA-TX1 University of Alabama Hospital;ALUA-TX1 University of Alabama Hospital;305;TXC;TXC',
    'Alabama'
  );

  // Likely non-lung: small community hospital
  await dumpReport(
    'ALAM University of South Alabama',
    'ALAM-TX1 University of South Alabama Medical Center;ALAM-TX1 University of South Alabama Medical Center;305;TXC;TXC',
    'Alabama'
  );

  // Likely non-lung: VA hospital in Arizona
  await dumpReport(
    'AZTV Veterans Administration Tucson',
    'AZTV-TX1 Veterans Administration Medical Center Tucson;AZTV-TX1 Veterans Administration Medical Center Tucson;305;TXC;TXC',
    'Arizona'
  );
})();
