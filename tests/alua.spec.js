const { test } = require('@playwright/test');

test('ALUA scrape', async ({ page }) => {
  await page.goto('https://hrsa.unos.org/data/view-data-reports/center-data/');

  await page.getByText('Center data Choose a State').click();
  await page.getByRole('button', { name: 'Go' }).click();

  await page.getByLabel('Choose Center:')
    .selectOption('ALUA-TX1 University of Alabama Hospital;ALUA-TX1 University of Alabama Hospital;305;TXC;TXC');

  await page.getByLabel('Choose Category:')
    .selectOption('2;Transplant');

  await page.getByLabel('Choose Organ:')
    .selectOption('Lung;Lung;8;Organ;Organ');

  await page.getByRole('link', { name: 'Transplants by Recipient Birth Sex' }).click();

  await page.waitForSelector('table');
// Wait extra moment to allow ASP.NET postback to finish
await page.waitForLoadState('networkidle');
await page.waitForSelector('#reportData');

const tableText = await page.locator('#reportData').innerText();

console.log("FULL REPORT TABLE:");
console.log(tableText);
});