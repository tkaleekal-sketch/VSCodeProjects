const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function run() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const datestamp = `${yyyy}${mm}${dd}`;
  const dateLabel = `${yyyy}-${mm}-${dd}`;

  const csvPath = path.join(__dirname, '..', 'lung-transplants.csv');
  const outPath = path.join(__dirname, '..', 'Reports', `lung-transplants_${datestamp}.xlsx`);

  const csvText = fs.readFileSync(csvPath, 'utf8');
  const lines = csvText.split('\n').filter(Boolean);

  // Parse CSV (handles quoted fields)
  function parseCsvLine(line) {
    const cells = [];
    let inQuote = false;
    let cell = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cells.push(cell);
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell);
    return cells;
  }

  const headerCells = parseCsvLine(lines[0]);
  const dataRows = lines.slice(1).map(parseCsvLine);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Lung Transplants');

  // Row 1: merged title heading
  const colCount = headerCells.length;
  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Center Lung-Transplants To Date (${dateLabel})`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  // Row 2: column headers
  const headerRow = sheet.addRow(headerCells);
  headerRow.eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF999999' } }
    };
  });

  // Data rows
  for (const row of dataRows) {
    const excelRow = sheet.addRow(row.map((cell, i) => {
      // Columns 3+ (year columns) are numeric
      if (i >= 2) {
        const n = parseInt(cell, 10);
        return isNaN(n) ? cell : n;
      }
      return cell;
    }));
    excelRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum >= 3) cell.alignment = { horizontal: 'center' };
    });
  }

  // Column widths
  sheet.getColumn(1).width = 8;   // Code
  sheet.getColumn(2).width = 48;  // Center Name
  for (let c = 3; c <= colCount; c++) {
    sheet.getColumn(c).width = 7; // Year columns
  }

  // Freeze panes below header row, after first 2 columns
  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];

  await workbook.xlsx.writeFile(outPath);
  console.log(`Excel saved: ${outPath}`);
}

run().catch(err => { console.error(err); process.exit(1); });
