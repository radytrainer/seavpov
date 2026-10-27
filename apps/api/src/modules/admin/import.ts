import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { GENDERS, studentCodeSchema, usernameSchema } from '@rt/shared';
import { audit } from '../../lib/audit';
import { parseCsv } from '../../lib/csv-parse';
import { badRequest } from '../../lib/errors';
import { generateTemporaryPassword, hashPassword } from '../../lib/security';

export const IMPORT_COLUMNS = [
  'student_id',
  'full_name',
  'username',
  'email',
  'gender',
  'generation',
  'class',
] as const;
const REQUIRED = ['student_id', 'full_name', 'username'] as const;
const MAX_ROWS = 2000;

const rowSchema = z.object({
  student_id: studentCodeSchema,
  full_name: z.string().trim().min(1, 'Full name is required').max(150),
  username: usernameSchema,
  email: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v.toLowerCase()))
    .pipe(z.email('Invalid email').max(254).nullable()),
  gender: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v.toUpperCase()))
    .pipe(z.enum(GENDERS, { error: `Gender must be one of ${GENDERS.join(', ')}` }).nullable()),
  generation: z.string().trim().max(100),
  class: z.string().trim().max(100),
});

export interface ImportIssue {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  dryRun: boolean;
  totalRows: number;
  valid: number;
  errors: ImportIssue[];
  created: { studentCode: string; username: string; fullName: string; temporaryPassword: string }[];
}

/**
 * Validates every row (format, duplicates within the file and against existing accounts,
 * class/generation lookup). Nothing is written unless the whole file is valid and dryRun is
 * false; then all students are created in one transaction with temporary passwords.
 */
export async function importStudents(
  app: FastifyInstance,
  request: FastifyRequest,
  csv: string,
  dryRun: boolean,
): Promise<ImportResult> {
  let table: string[][];
  try {
    table = parseCsv(csv);
  } catch (err) {
    throw badRequest(`The file could not be read as CSV: ${(err as Error).message}`);
  }
  if (table.length < 2) throw badRequest('The file needs a header row and at least one student');
  const header = table[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) throw badRequest(`Missing required column(s): ${missing.join(', ')}`);
  const unknown = header.filter(
    (h) => !IMPORT_COLUMNS.includes(h as (typeof IMPORT_COLUMNS)[number]),
  );
  if (unknown.length) throw badRequest(`Unknown column(s): ${unknown.join(', ')}`);
  const body = table.slice(1);
  if (body.length > MAX_ROWS) throw badRequest(`At most ${MAX_ROWS} students per import`);

  const errors: ImportIssue[] = [];
  const parsed: { row: number; data: z.infer<typeof rowSchema> }[] = [];
  body.forEach((cells, i) => {
    const row = i + 2; // spreadsheet row number (header is row 1)
    const record = Object.fromEntries(
      IMPORT_COLUMNS.map((c) => [c, cells[header.indexOf(c)] ?? '']),
    );
    const result = rowSchema.safeParse(record);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ row, field: String(issue.path[0] ?? ''), message: issue.message });
      }
    } else {
      parsed.push({ row, data: result.data });
    }
  });

  // Duplicates inside the file.
  for (const key of ['student_id', 'username', 'email'] as const) {
    const seen = new Map<string, number>();
    for (const p of parsed) {
      const v = p.data[key];
      if (!v) continue;
      const first = seen.get(v);
      if (first) errors.push({ row: p.row, field: key, message: `Duplicate of row ${first}` });
      else seen.set(v, p.row);
    }
  }

  // Conflicts with existing accounts.
  const existing = await app.prisma.user.findMany({
    where: {
      OR: [
        { studentCode: { in: parsed.map((p) => p.data.student_id) } },
        { username: { in: parsed.map((p) => p.data.username) } },
        { email: { in: parsed.flatMap((p) => (p.data.email ? [p.data.email] : [])) } },
      ],
    },
    select: { studentCode: true, username: true, email: true },
  });
  const taken = {
    student_id: new Set(existing.map((e) => e.studentCode)),
    username: new Set(existing.map((e) => e.username)),
    email: new Set(existing.map((e) => e.email)),
  };
  for (const p of parsed) {
    for (const key of ['student_id', 'username', 'email'] as const) {
      const v = p.data[key];
      if (v && taken[key].has(v))
        errors.push({ row: p.row, field: key, message: 'Already used by an existing account' });
    }
  }

  // Resolve "generation + class" to an existing, non-archived class.
  const classes = await app.prisma.class.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, generation: { select: { name: true } } },
  });
  const classIds = new Map<number, string | null>();
  for (const p of parsed) {
    if (!p.data.class) {
      if (p.data.generation)
        errors.push({
          row: p.row,
          field: 'class',
          message: 'Class is required when a generation is given',
        });
      classIds.set(p.row, null);
      continue;
    }
    const matches = classes.filter(
      (c) =>
        c.name.toLowerCase() === p.data.class.toLowerCase() &&
        (!p.data.generation || c.generation.name.toLowerCase() === p.data.generation.toLowerCase()),
    );
    if (matches.length === 1) classIds.set(p.row, matches[0]!.id);
    else
      errors.push({
        row: p.row,
        field: 'class',
        message:
          matches.length === 0
            ? `Class "${p.data.class}"${p.data.generation ? ` in "${p.data.generation}"` : ''} not found`
            : `Class "${p.data.class}" exists in several generations; add the generation column`,
      });
  }

  errors.sort((a, b) => a.row - b.row);
  const result: ImportResult = {
    dryRun,
    totalRows: body.length,
    valid: parsed.length,
    errors,
    created: [],
  };
  const errorRows = new Set(errors.map((e) => e.row));
  result.valid = parsed.filter((p) => !errorRows.has(p.row)).length;
  if (dryRun || errors.length > 0) return result;

  const prepared = await Promise.all(
    parsed.map(async (p) => {
      const temporaryPassword = generateTemporaryPassword();
      return { p, temporaryPassword, passwordHash: await hashPassword(temporaryPassword) };
    }),
  );
  await app.prisma.$transaction(async (tx) => {
    await tx.user.createMany({
      data: prepared.map(({ p, passwordHash }) => ({
        role: 'STUDENT' as const,
        studentCode: p.data.student_id,
        fullName: p.data.full_name,
        username: p.data.username,
        email: p.data.email,
        gender: p.data.gender,
        classId: classIds.get(p.row) ?? null,
        passwordHash,
        mustChangePassword: true,
      })),
    });
    await audit(tx, request, {
      action: 'user.imported',
      entityType: 'user',
      metadata: { count: prepared.length },
    });
  });
  result.created = prepared.map(({ p, temporaryPassword }) => ({
    studentCode: p.data.student_id,
    username: p.data.username,
    fullName: p.data.full_name,
    temporaryPassword,
  }));
  return result;
}
