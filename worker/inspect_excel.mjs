import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

const fp = 'C:\\Users\\Katie\\Downloads\\DMPT1 \u5fae\u8edf Surface \u5546\u7528\u50f9\u683c\u8868Y2603.xlsx';
const buf = readFileSync(fp);
const wb = XLSX.read(buf, { type: 'buffer' });

console.log('=== SHEET NAMES ===');
wb.SheetNames.forEach((n, i) => console.log(i, JSON.stringify(n)));

wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const nonEmpty = data.filter(r => r && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
  console.log('\n--- Sheet:', JSON.stringify(name), '| rows:', data.length, '| non-empty:', nonEmpty.length, ' ---');
  nonEmpty.slice(0, 25).forEach((row, i) => {
    const cells = row.map(c => String(c != null ? c : '').replace(/\n/g, '\\n').substring(0, 35));
    console.log('  R' + String(i).padStart(2) + ': ' + cells.join(' | ').substring(0, 160));
  });
});
