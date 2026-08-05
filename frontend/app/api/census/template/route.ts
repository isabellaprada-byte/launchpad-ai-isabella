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

  ws.addRow(HEADERS);
  ws.addRow([]);
  ws.addRow([]);

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="ForUsAll-Census-Template.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
