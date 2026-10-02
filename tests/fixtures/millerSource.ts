import { PDFDocument, StandardFonts } from 'pdf-lib';
import { gmawSource } from '../welding/fixtures';

export function fictionalMillerHtml(tableTitle = 'Recommended Welding Settings', process = 'MIG'): string {
  const fixture = gmawSource();
  const data = {
    documentNumber: 'OM-FICTIONAL', edition: 'Fictional Revision A',
    tables: [{ title: tableTitle, headers: ['Process', 'Wire Size (mm)', 'WFS (m/min)', 'Voltage (V)', 'Shielding Gas', 'Polarity', 'Transfer Type'],
      rows: [[process, String(fixture.wireDiameter.value), `${fixture.wireFeed.min}\u2013${fixture.wireFeed.max}`, `${fixture.voltage.min}-${fixture.voltage.max}`, 'Fictional Gas', 'DCEP', 'Fictional Transfer']] }],
  };
  return `<!doctype html><html><head><title>Fictional Miller Weld-Setting Calculator</title></head><body><script type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

export async function fictionalMillerPdf(tableTitle = 'FCAW And MIG Process Parameters'): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle('Fictional Miller Manual');
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([1800, 800]);
  const fixture = gmawSource();
  const draw = (text: string, x: number, y: number) => page.drawText(text, { x, y, font, size: 10 });
  draw('Manual Number: OM-FICTIONAL', 60, 760);
  draw('Revision: Fictional Revision A', 60, 740);
  draw(tableTitle, 60, 640);
  const headers = ['Process', 'Wire Size (mm)', 'WFS (m/min)', 'Voltage (V)', 'Shielding Gas', 'Polarity', 'Transfer Type'];
  const cells = ['MIG', String(fixture.wireDiameter.value), `${fixture.wireFeed.min}-${fixture.wireFeed.max}`, `${fixture.voltage.min}-${fixture.voltage.max}`, 'Fictional Gas', 'DCEP', 'Fictional Transfer'];
  headers.forEach((header, index) => draw(header, 60 + index * 240, 610));
  cells.forEach((cell, index) => draw(cell, 60 + index * 240, 580));
  draw('END TABLE', 60, 540);
  return document.save();
}