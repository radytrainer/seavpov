import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

/**
 * Shared PDF building blocks: fonts (Latin + Khmer), brand header/footer, mixed-script text.
 * pdfkit shapes text with fontkit; fontkit is patched (patches/fontkit@*.patch) so Khmer marks
 * position correctly with Noto Sans Khmer.
 */

function assetsDir(): string {
  const candidates = [
    process.env.ASSETS_DIR,
    path.resolve(import.meta.dirname, '../../assets'), // src/lib (development, tests)
    path.resolve(import.meta.dirname, '../assets'), // dist (production bundle)
    path.resolve(process.cwd(), 'assets'),
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find((p) => fs.existsSync(path.join(p, 'fonts')));
  if (!found) throw new Error('PDF assets not found (set ASSETS_DIR)');
  return found;
}

export const PDF_COLORS = {
  ink: '#1F2328',
  muted: '#6B7280',
  line: '#E5E7EB',
  panel: '#F6F7F9',
  cyan: '#29B5E8',
  cyanTint: '#EDF8FD',
  dark: '#141414',
} as const;

export type Doc = PDFKit.PDFDocument;
export type Weight = 'regular' | 'bold';

const KHMER = /([ក-៿᧠-᧿]+(?:[\s\u200B]+[ក-៿᧠-᧿]+)*)/;

export const PAGE = { width: 595.28, height: 841.89, margin: 48, top: 104, bottom: 64 } as const;
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

export interface DocMeta {
  title: string;
  subtitle: string;
  institution: string;
  generatedAt: string;
  footerNote: string;
}

/** A4 document with fonts registered and the brand header on every page. */
export function createDoc(meta: DocMeta): Doc {
  const dir = assetsDir();
  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.margin, right: PAGE.margin },
    info: { Title: meta.title, Author: meta.institution, Creator: 'សៀវភៅ PN' },
    lang: 'km',
  });
  doc.registerFont('latin', path.join(dir, 'fonts/NotoSans-Regular.ttf'));
  doc.registerFont('latin-bold', path.join(dir, 'fonts/NotoSans-Bold.ttf'));
  doc.registerFont('khmer', path.join(dir, 'fonts/NotoSansKhmer-Regular.ttf'));
  doc.registerFont('khmer-bold', path.join(dir, 'fonts/NotoSansKhmer-Bold.ttf'));
  const logo = fs.readFileSync(path.join(dir, 'logo.png'));

  // Headers and footers are drawn for every page in finishDoc(), after the content: drawing
  // text from a "pageAdded" handler would corrupt a paragraph that is flowing across pages.
  const header = () => {
    doc.image(logo, PAGE.margin, 30, { width: 42, height: 42 });
    write(doc, 'សៀវភៅ PN', { x: PAGE.margin + 52, y: 33, size: 13, weight: 'bold' });
    write(doc, meta.institution, {
      x: PAGE.margin + 52,
      y: 54,
      size: 8.5,
      color: PDF_COLORS.muted,
      width: 220,
    });
    write(doc, meta.title, {
      x: PAGE.width - PAGE.margin - 260,
      y: 34,
      size: 12,
      weight: 'bold',
      width: 260,
      align: 'right',
    });
    write(doc, meta.subtitle, {
      x: PAGE.width - PAGE.margin - 260,
      y: 53,
      size: 8.5,
      color: PDF_COLORS.muted,
      width: 260,
      align: 'right',
    });
    doc.rect(PAGE.margin, 80, CONTENT_WIDTH, 2).fill(PDF_COLORS.cyan);
  };
  (doc as BrandedDoc)._brand = {
    header,
    footerNote: meta.footerNote,
    generatedAt: meta.generatedAt,
  };
  doc.x = PAGE.margin;
  doc.y = PAGE.top;
  doc.fillColor(PDF_COLORS.ink);
  return doc;
}

type BrandedDoc = Doc & {
  _brand: { header: () => void; footerNote: string; generatedAt: string };
};

/** Draws the brand header and footer (note, date, "Page x of y") on every page, then ends. */
export function finishDoc(doc: Doc): void {
  const brand = (doc as BrandedDoc)._brand;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = PAGE.height - 40;
    // Temporarily remove the bottom margin so footer text does not trigger a new page.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    brand.header();
    doc
      .moveTo(PAGE.margin, y - 8)
      .lineTo(PAGE.width - PAGE.margin, y - 8)
      .lineWidth(0.5)
      .stroke(PDF_COLORS.line);
    write(doc, `${brand.footerNote} · Generated ${brand.generatedAt}`, {
      x: PAGE.margin,
      y,
      size: 7.5,
      color: PDF_COLORS.muted,
      width: CONTENT_WIDTH - 80,
    });
    write(doc, `Page ${i + 1 - range.start} of ${range.count}`, {
      x: PAGE.width - PAGE.margin - 80,
      y,
      size: 7.5,
      color: PDF_COLORS.muted,
      width: 80,
      align: 'right',
    });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
}

export interface WriteOptions {
  x?: number;
  y?: number;
  size?: number;
  weight?: Weight;
  color?: string;
  width?: number;
  align?: 'left' | 'right' | 'center' | 'justify';
  lineGap?: number;
}

/**
 * Writes text that may mix Khmer and Latin script: each run uses the matching font so both
 * render correctly, while pdfkit wraps the runs as one paragraph.
 */
export function write(doc: Doc, text: string, o: WriteOptions = {}): void {
  const size = o.size ?? 10;
  const weight = o.weight ?? 'regular';
  const runs = text.split(KHMER).filter((r) => r.length > 0);
  if (runs.length === 0) return;
  const opts = {
    width: o.width ?? CONTENT_WIDTH - ((o.x ?? doc.x) - PAGE.margin),
    align: o.align ?? 'left',
    lineGap: o.lineGap ?? 2,
  };
  doc.fillColor(o.color ?? PDF_COLORS.ink).fontSize(size);
  runs.forEach((run, i) => {
    const khmer = /[ក-៿᧠-᧿]/.test(run);
    doc.font(`${khmer ? 'khmer' : 'latin'}${weight === 'bold' ? '-bold' : ''}`);
    const continued = i < runs.length - 1;
    if (i === 0 && (o.x !== undefined || o.y !== undefined)) {
      doc.text(run, o.x ?? doc.x, o.y ?? doc.y, { ...opts, continued });
    } else {
      doc.text(run, { ...opts, continued });
    }
  });
}

/** Height a mixed-script paragraph will take (approximation using the Khmer font metrics). */
export function heightOf(doc: Doc, text: string, o: WriteOptions = {}): number {
  const khmer = /[ក-៿]/.test(text);
  doc
    .font(`${khmer ? 'khmer' : 'latin'}${o.weight === 'bold' ? '-bold' : ''}`)
    .fontSize(o.size ?? 10);
  return doc.heightOfString(text, { width: o.width ?? CONTENT_WIDTH, lineGap: o.lineGap ?? 2 });
}

/** Starts a new page when less than `needed` points remain. */
export function ensureSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > PAGE.height - PAGE.bottom) doc.addPage();
}

/** Collects the PDF into a Buffer. */
export function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
