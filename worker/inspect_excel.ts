import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

const buf = readFileSync('./surface_pricing.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });

console.log('=== SHEET NAMES ===');
wb.SheetNames.forEach((n, i) => console.log(i, JSON.stringify(n)));

wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  const nonEmpty = data.filter(r => r && r.some((c: any) => String(c ?? '').trim() !== ''));
  console.log('\n\n=== Sheet:', JSON.stringify(name), '| total rows:', data.length, '| non-empty:', nonEmpty.length, '===');

  // Print first 35 non-empty rows with column contents
  nonEmpty.slice(0, 35).forEach((row: any[], i: number) => {
    const cells = row.map((c: any) => {
      const s = String(c ?? '').replace(/\n/g, '\\n').replace(/\r/g, '');
      return s.substring(0, 35);
    });
    // Show up to 8 cells
    console.log('  R' + String(i).padStart(3, '0') + ': ' + cells.slice(0, 8).join(' | '));
  });

  // Also show rows 35-60 if sheet is large
  if (nonEmpty.length > 35) {
    console.log('  ... (skipping to row 35) ...');
    nonEmpty.slice(35, 55).forEach((row: any[], i: number) => {
      const cells = row.map((c: any) => String(c ?? '').replace(/\n/g, '\\n').substring(0, 35));
      console.log('  R' + String(i + 35).padStart(3, '0') + ': ' + cells.slice(0, 8).join(' | '));
    });
  }
});
