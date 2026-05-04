const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('list all centers', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto('https://hrsa.unos.org/data/view-data-reports/center-data/');

  await page.getByText('Center data Choose a State').click();

  // Get all state options from the state dropdown
  const stateSelect = page.locator('select').first();
  const stateOptions = await stateSelect.evaluate(sel =>
    Array.from(sel.options)
      .map(o => ({ value: o.value, label: o.text.trim() }))
      .filter(o => o.value)
  );

  console.log(`Found ${stateOptions.length} states`);

  const allCenters = [];

  for (const state of stateOptions) {
    await stateSelect.selectOption(state.value);
    await page.getByRole('button', { name: 'Go' }).click();
    await page.waitForTimeout(1000);

    const centerSelect = page.getByLabel('Choose Center:');
    const exists = await centerSelect.count();
    if (!exists) continue;

    const centers = await centerSelect.evaluate(sel =>
      Array.from(sel.options)
        .map(o => ({ value: o.value, label: o.text.trim() }))
        .filter(o => o.value)
    );

    for (const c of centers) {
      allCenters.push({ state: state.label, ...c });
    }

    console.log(`${state.label}: ${centers.length} centers`);

    // Go back to reset state for next iteration
    await page.goto('https://hrsa.unos.org/data/view-data-reports/center-data/');
    await page.getByText('Center data Choose a State').click();
  }

  const lines = allCenters.map(c => `${c.state}\t${c.label}\t${c.value}`);
  const outPath = path.join(__dirname, '..', 'centers.txt');
  fs.writeFileSync(outPath, ['State\tCenter Label\tSelect Value', ...lines].join('\n'), 'utf8');

  console.log(`\nTotal: ${allCenters.length} centers saved to centers.txt`);
});
