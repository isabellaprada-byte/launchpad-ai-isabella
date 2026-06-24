import { NextResponse } from 'next/server';
import * as XLSX from 'exceljs';

const HEADERS = [
  'Social Security Number',
  'Name - Last',
  'Name - First',
  'Gender',
  'Date of Birth',
  'Date of Hire - Original',
  'Date of Rehire',
  'Termination Date',
  'Address - Street 1',
  'Address - Street 2',
  'Address - City',
  'Address - State',
  'Address - Postal Code',
  'Division ID',
  'Pre-tax Deferral',
  'Roth Amount',
  'Matching Amount',
  'Matching Safe Harbor',
  'Profit Sharing',
  'Non Elective Safe Harbor',
  'Plan Compensation',
  'Current Hours',
  'Marital Status',
  'Loan Payments',
  'Internet Address - Other',
  'phone',
];

export async function GET() {
  const wb = new XLSX.Workbook();
  const ws = wb.addWorksheet('Census');

  // Header row — bold, blue background
  const headerRow = ws.addRow(HEADERS);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
  });
  headerRow.height = 32;

  // One example row (grayed out)
  const exampleRow = ws.addRow([
    '123-45-6789', 'Doe', 'John', 'M', '01/15/1985', '03/01/2020',
    '', '', '123 Main St', 'Apt 2', 'Springfield', 'IL', '62701',
    '', '', '', '', '', '', '', '', '', '', '', 'john.doe@company.com', '+1 5551234567',
  ]);
  exampleRow.eachCell(cell => {
    cell.font = { color: { argb: 'FF94A3B8' }, italic: true };
  });

  // Auto-width columns
  ws.columns.forEach((col, i) => {
    const headerLen = HEADERS[i]?.length ?? 10;
    col.width = Math.max(headerLen + 2, 14);
  });

  // Freeze header row
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ForUsAll-Census-Template.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
