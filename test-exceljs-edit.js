const ExcelJS = require('exceljs');
const path = require('path');

(async () => {
  const file = path.join(__dirname, 'Plantilla_DESEMBARGO.xlsx');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(file, { ignoreNodes: ['comments'] });
    console.log('OK with ignoreNodes comments');
    const ws = wb.worksheets[0];
    console.log('Sheet name:', ws.name);
    console.log('Row2:', ws.getRow(2).values);
  } catch (err) {
    console.error('FAILED:', err.message);
  }
})();
