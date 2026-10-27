import type { FastifyInstance, FastifyRequest } from 'fastify';
import { REFLECTION_LABELS, formatDuration } from '@rt/shared';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthContext } from '../../plugins/auth';
import { visibleStudentFilter, assertCanViewStudent } from '../../lib/access';
import { audit } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { getSettings } from '../../lib/settings';
import {
  CONTENT_WIDTH,
  PAGE,
  PDF_COLORS,
  createDoc,
  ensureSpace,
  finishDoc,
  heightOf,
  toBuffer,
  write,
  type Doc,
} from '../../lib/pdf';

const MAX_REFLECTIONS = 200;

const pdfSelect = {
  id: true,
  studentId: true,
  whatRead: true,
  learned: true,
  keyIdeas: true,
  application: true,
  keyTakeaway: true,
  understandingRating: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tag: { select: { name: true } } }, orderBy: { tag: { name: 'asc' } } },
  student: {
    select: {
      fullName: true,
      studentCode: true,
      class: { select: { name: true, generation: { select: { name: true } } } },
    },
  },
  session: {
    select: {
      readingDate: true,
      startedAt: true,
      endedAt: true,
      durationSeconds: true,
      startPage: true,
      endPage: true,
      source: true,
      studentBook: { select: { libraryBook: { select: { title: true, author: true } } } },
    },
  },
  feedback: {
    select: { body: true, createdAt: true, trainer: { select: { fullName: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ReadingReflectionSelect;

type Row = Prisma.ReadingReflectionGetPayload<{ select: typeof pdfSelect }>;

function fmtDate(d: Date | string, timeZone: string, withTime = false): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: typeof d === 'string' ? 'UTC' : timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(typeof d === 'string' ? new Date(`${d}T00:00:00Z`) : d);
}

/** Label/value grid in a light panel (student, class, date, time, pages…). */
function factsPanel(doc: Doc, facts: [string, string][]) {
  const cols = 3;
  const colW = (CONTENT_WIDTH - 24) / cols;
  // Each row is as tall as its tallest value, so long values wrap without overlapping.
  const rowHeights: number[] = [];
  for (let r = 0; r * cols < facts.length; r++) {
    const values = facts.slice(r * cols, r * cols + cols).map(([, v]) => v);
    rowHeights.push(
      12 + Math.max(...values.map((v) => heightOf(doc, v, { size: 9.5, width: colW - 8 }))) + 6,
    );
  }
  const height = rowHeights.reduce((a, h) => a + h, 0) + 14;
  ensureSpace(doc, height + 14);
  const panelTop = doc.y;
  doc.roundedRect(PAGE.margin, panelTop, CONTENT_WIDTH, height, 6).fill(PDF_COLORS.panel);
  facts.forEach(([label, value], i) => {
    const row = Math.floor(i / cols);
    const x = PAGE.margin + 12 + (i % cols) * colW;
    const y = panelTop + 9 + rowHeights.slice(0, row).reduce((a, h) => a + h, 0);
    write(doc, label.toUpperCase(), { x, y, size: 6.5, color: PDF_COLORS.muted, width: colW - 8 });
    write(doc, value, { x, y: y + 9, size: 9.5, width: colW - 8 });
  });
  doc.x = PAGE.margin;
  doc.y = panelTop + height + 14;
}

function section(doc: Doc, label: string, text: string) {
  ensureSpace(doc, 40 + Math.min(heightOf(doc, text, { size: 10.5 }), 120));
  write(doc, label, { x: PAGE.margin, size: 9, weight: 'bold', color: PDF_COLORS.muted });
  doc.moveDown(0.15);
  write(doc, text, { x: PAGE.margin, size: 10.5, lineGap: 3 });
  doc.moveDown(0.8);
}

function takeaway(doc: Doc, text: string) {
  const inner = CONTENT_WIDTH - 28;
  const h = heightOf(doc, text, { size: 11, width: inner, weight: 'bold' }) + 30;
  ensureSpace(doc, h + 10);
  const top = doc.y;
  doc.rect(PAGE.margin, top, CONTENT_WIDTH, h).fill(PDF_COLORS.cyanTint);
  doc.rect(PAGE.margin, top, 3, h).fill(PDF_COLORS.cyan);
  write(doc, REFLECTION_LABELS.keyTakeaway.toUpperCase(), {
    x: PAGE.margin + 16,
    y: top + 9,
    size: 7,
    color: PDF_COLORS.muted,
    width: inner,
  });
  write(doc, text, { x: PAGE.margin + 16, y: top + 20, size: 11, weight: 'bold', width: inner });
  doc.x = PAGE.margin;
  doc.y = top + h + 14;
}

function rating(doc: Doc, value: number) {
  ensureSpace(doc, 30);
  const y = doc.y;
  write(doc, REFLECTION_LABELS.understandingRating, {
    x: PAGE.margin,
    y,
    size: 9,
    weight: 'bold',
    color: PDF_COLORS.muted,
    width: 200,
  });
  for (let i = 0; i < 5; i++) {
    const cx = PAGE.margin + 214 + i * 14;
    doc.circle(cx, y + 6.5, 4.5);
    if (i < value) doc.fill(PDF_COLORS.cyan);
    else doc.lineWidth(1).stroke(PDF_COLORS.line);
  }
  write(doc, `${value} / 5`, { x: PAGE.margin + 290, y, size: 9.5, width: 60 });
  doc.x = PAGE.margin;
  doc.y = y + 22;
}

function reflectionBlock(doc: Doc, r: Row, timeZone: string, showStudent: boolean) {
  const s = r.session;
  const book = s.studentBook.libraryBook;
  ensureSpace(doc, 140);
  write(doc, book.title, { x: PAGE.margin, size: 16, weight: 'bold' });
  if (book.author) write(doc, book.author, { x: PAGE.margin, size: 10, color: PDF_COLORS.muted });
  doc.moveDown(0.6);

  const cls = r.student.class;
  const facts: [string, string][] = [];
  if (showStudent) {
    facts.push(['Student', r.student.fullName]);
    facts.push(['Student ID', r.student.studentCode ?? '—']);
    facts.push(['Class', cls ? `${cls.name} · ${cls.generation.name}` : '—']);
  }
  facts.push(['Date read', fmtDate(s.readingDate.toISOString().slice(0, 10), timeZone)]);
  facts.push([
    'Reading time',
    `${formatDuration(s.durationSeconds)}${s.source === 'MANUAL' ? ' (manual entry)' : ''}`,
  ]);
  facts.push([
    'Pages',
    s.startPage != null && s.endPage != null
      ? `${s.startPage}–${s.endPage} (${s.endPage - s.startPage} pages)`
      : '—',
  ]);
  factsPanel(doc, facts);

  if (r.keyTakeaway) takeaway(doc, r.keyTakeaway);
  for (const f of ['whatRead', 'learned', 'keyIdeas', 'application'] as const) {
    if (r[f]) section(doc, REFLECTION_LABELS[f], r[f]!);
  }
  if (r.understandingRating) rating(doc, r.understandingRating);
  if (r.tags.length > 0) {
    ensureSpace(doc, 24);
    write(doc, `Tags:  ${r.tags.map((t) => `#${t.tag.name}`).join('   ')}`, {
      x: PAGE.margin,
      size: 9,
      color: PDF_COLORS.muted,
    });
    doc.moveDown(0.8);
  }

  if (r.feedback.length > 0) {
    ensureSpace(doc, 60);
    doc
      .moveTo(PAGE.margin, doc.y)
      .lineTo(PAGE.width - PAGE.margin, doc.y)
      .lineWidth(0.5)
      .stroke(PDF_COLORS.line);
    doc.moveDown(0.6);
    write(doc, 'Trainer feedback', { x: PAGE.margin, size: 11, weight: 'bold' });
    doc.moveDown(0.3);
    for (const fb of r.feedback) {
      ensureSpace(doc, 40);
      write(doc, `${fb.trainer.fullName} · ${fmtDate(fb.createdAt, timeZone)}`, {
        x: PAGE.margin,
        size: 8.5,
        color: PDF_COLORS.muted,
      });
      write(doc, fb.body, { x: PAGE.margin, size: 10.5, lineGap: 3 });
      doc.moveDown(0.6);
    }
  }
  doc.moveDown(0.4);
  write(
    doc,
    `Written ${fmtDate(r.createdAt, timeZone, true)}${r.updatedAt.getTime() - r.createdAt.getTime() > 60_000 ? ` · last edited ${fmtDate(r.updatedAt, timeZone, true)}` : ''}`,
    { x: PAGE.margin, size: 8, color: PDF_COLORS.muted },
  );
}

async function render(
  app: FastifyInstance,
  rows: Row[],
  opts: { title: string; subtitle: string; summary?: { student: Row['student']; period: string } },
) {
  const settings = await getSettings(app.prisma);
  const tz = settings.timeZone;
  const doc = createDoc({
    title: opts.title,
    subtitle: opts.subtitle,
    institution: settings.institutionName,
    generatedAt: fmtDate(app.now(), tz, true),
    footerNote: 'Confidential: for the student, their trainers and school administrators',
  });
  const done = toBuffer(doc);

  if (opts.summary) {
    const st = opts.summary.student;
    write(doc, st.fullName, { x: PAGE.margin, size: 20, weight: 'bold' });
    write(
      doc,
      [st.studentCode, st.class ? `${st.class.name} · ${st.class.generation.name}` : null]
        .filter(Boolean)
        .join('  ·  '),
      { x: PAGE.margin, size: 10, color: PDF_COLORS.muted },
    );
    doc.moveDown(0.8);
    const minutes = rows.reduce((a, r) => a + r.session.durationSeconds, 0);
    const books = new Set(rows.map((r) => r.session.studentBook.libraryBook.title)).size;
    factsPanel(doc, [
      ['Period', opts.summary.period],
      ['Reflections', String(rows.length)],
      ['Books', String(books)],
      ['Reading time (reflected sessions)', formatDuration(minutes)],
      ['With trainer feedback', String(rows.filter((r) => r.feedback.length > 0).length)],
      [
        'Average understanding',
        (() => {
          const rated = rows.filter((r) => r.understandingRating);
          return rated.length
            ? `${(rated.reduce((a, r) => a + r.understandingRating!, 0) / rated.length).toFixed(1)} / 5`
            : '—';
        })(),
      ],
    ]);
    write(doc, 'Contents', { x: PAGE.margin, size: 11, weight: 'bold' });
    doc.moveDown(0.3);
    rows.forEach((r, i) => {
      ensureSpace(doc, 16);
      write(
        doc,
        `${i + 1}.  ${fmtDate(r.session.readingDate.toISOString().slice(0, 10), tz)}  —  ${r.session.studentBook.libraryBook.title}`,
        { x: PAGE.margin, size: 9.5 },
      );
    });
    rows.forEach((r) => {
      doc.addPage();
      reflectionBlock(doc, r, tz, false);
    });
  } else {
    rows.forEach((r, i) => {
      if (i > 0) doc.addPage();
      reflectionBlock(doc, r, tz, true);
    });
  }
  finishDoc(doc);
  return done;
}

/** One reflection as PDF (visible to the owner, assigned trainers and admins). */
export async function reflectionPdf(
  app: FastifyInstance,
  request: FastifyRequest,
  actor: AuthContext,
  id: string,
) {
  const row = await app.prisma.readingReflection.findFirst({
    where: { AND: [{ id }, visibleStudentFilter(actor)] },
    select: pdfSelect,
  });
  if (!row) throw notFound('Reflection');
  if (actor.role !== 'STUDENT') {
    await audit(app.prisma, request, {
      action: 'reflection.exported',
      entityType: 'reflection',
      entityId: id,
      metadata: { studentId: row.studentId, count: 1 },
    });
  }
  const book = row.session.studentBook.libraryBook.title;
  const buffer = await render(app, [row], {
    title: 'Reading reflection',
    subtitle: `${row.student.fullName} · ${book}`,
  });
  return {
    buffer,
    filename: `reflection_${row.session.readingDate.toISOString().slice(0, 10)}.pdf`,
  };
}

/** All reflections of one student (optionally a date range or book) as one PDF. */
export async function studentReflectionsPdf(
  app: FastifyInstance,
  request: FastifyRequest,
  actor: AuthContext,
  q: { studentId?: string; from?: string; to?: string; studentBookId?: string },
) {
  const studentId = actor.role === 'STUDENT' ? actor.userId : q.studentId;
  if (!studentId) throw badRequest('Choose a student');
  await assertCanViewStudent(app.prisma, actor, studentId);
  const student = await app.prisma.user.findFirst({
    where: { id: studentId, role: 'STUDENT' },
    select: pdfSelect.student.select,
  });
  if (!student) throw notFound('Student');
  const rows = await app.prisma.readingReflection.findMany({
    where: {
      studentId,
      session: {
        ...(q.studentBookId ? { studentBookId: q.studentBookId } : {}),
        ...(q.from || q.to
          ? {
              readingDate: {
                gte: q.from ? new Date(`${q.from}T00:00:00Z`) : undefined,
                lte: q.to ? new Date(`${q.to}T00:00:00Z`) : undefined,
              },
            }
          : {}),
      },
    },
    select: pdfSelect,
    orderBy: [{ session: { readingDate: 'asc' } }, { createdAt: 'asc' }],
    take: MAX_REFLECTIONS + 1,
  });
  if (rows.length === 0) throw notFound('Reflections for this selection');
  if (rows.length > MAX_REFLECTIONS) {
    throw badRequest(
      `Too many reflections (more than ${MAX_REFLECTIONS}); choose a shorter period`,
    );
  }
  if (actor.role !== 'STUDENT') {
    await audit(app.prisma, request, {
      action: 'reflection.exported',
      entityType: 'user',
      entityId: studentId,
      metadata: { count: rows.length, from: q.from ?? null, to: q.to ?? null },
    });
  }
  const settings = await getSettings(app.prisma);
  const first = rows[0]!.session.readingDate.toISOString().slice(0, 10);
  const last = rows.at(-1)!.session.readingDate.toISOString().slice(0, 10);
  const period = `${fmtDate(q.from ?? first, settings.timeZone)} – ${fmtDate(q.to ?? last, settings.timeZone)}`;
  const buffer = await render(app, rows, {
    title: 'Reading reflections',
    subtitle: `${student.fullName} · ${period}`,
    summary: { student, period },
  });
  const slug = (student.studentCode ?? 'student').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return { buffer, filename: `reflections_${slug}.pdf` };
}
