import { degrees, PDFDocument, StandardFonts } from 'pdf-lib';
import { gmawSource } from '../welding/fixtures';

export async function fictionalLincolnPdf(mode: 'machine' | 'direct' | 'blank' | 'malformed' | 'duplicate' | 'unsupported' | 'unlabeled' | 'code-under-voltage' | 'rotated' | 'page-rotated' | 'sparse' = 'machine'): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle('Fictional Lincoln-style Machine Manual');
  document.setAuthor('Fictional fixture only');
  const font = await document.embedFont(StandardFonts.Helvetica);
  const rotated = mode === 'rotated';
  const page = document.addPage(rotated ? [800, 2000] : [2000, 800]);
  if (mode === 'page-rotated') page.setRotation(degrees(90));
  const fixture = gmawSource();
  const text = (value: string, x: number, y: number) => page.drawText(value, rotated
    ? { x: y, y: 2000 - x, size: 10, font, rotate: degrees(-90) }
    : { x, y, size: 10, font });
  if (mode === 'sparse') {
    text('APPLICATION CHART', 60, 640);
    return document.save();
  }
  text('Manual Number: IM-FICTIONAL', 60, 760);
  text('Machine: Fictional Test Machine', 60, 740);
  text('Process: GMAW', 60, 720);
  text('Welding Wire: WIRE-FIXTURE', 60, 700);
  text('Shielding Gas: NONE', 60, 680);
  text(mode === 'unlabeled' ? 'MAINTENANCE CHART' : mode === 'direct' ? 'SUGGESTED SETTINGS FOR WELDING' : 'APPLICATION CHART', 60, 640);
  const direct = mode === 'direct' || mode === 'code-under-voltage';
  const headers = direct
    ? ['Thickness', 'Voltage (V)', 'Current (A)', 'Wire Feed Speed (in/min)', 'Gas Flow (L/min)']
    : ['Process', 'Wire', 'Wire Diameter', 'Shielding Gas', 'Thickness', 'Setting'];
  const values = direct
    ? ['.060 in / 1.6 mm', `${fixture.voltage.min} - ${fixture.voltage.max}`, `${fixture.amperage!.min} - ${fixture.amperage!.max}`, `${fixture.wireFeed.min} - ${fixture.wireFeed.max}`, `${fixture.gasFlow!.min} - ${fixture.gasFlow!.max}`]
    : ['GMAW', fixture.wireClass, `${fixture.wireDiameter.value} ${fixture.wireDiameter.unit}`, 'NONE', '.060 in / 1.6 mm', 'B-3'];
  if (mode === 'code-under-voltage') values[1] = 'B-3';
  headers.forEach((header, index) => text(mode === 'unsupported' && index === 0 ? 'Unrecognized header' : header, 60 + index * 250, 610));
  const row = (y: number) => values.forEach((value, index) => {
    if (mode === 'blank' && index === values.length - 1) return;
    text(value, 60 + index * 250 + (mode === 'malformed' && index === values.length - 1 ? 40 : 0), y);
  });
  row(580);
  if (mode === 'duplicate') row(550);
  text('END TABLE', 60, 520);
  return document.save();
}