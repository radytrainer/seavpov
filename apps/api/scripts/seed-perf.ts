/**
 * Generates a representative dataset for performance measurement (NOT for production):
 * STUDENTS students in 6 classes, assigned to trainer1, each with ~DAYS days of reading history.
 * Run after the development seed, against a dedicated database:
 *   DATABASE_URL=...reading_tracker_perf tsx scripts/seed-perf.ts
 */
import { randomUUID } from 'node:crypto';
import { normalizedBookKey } from '@rt/shared';
import { createPrismaClient } from '../src/plugins/prisma';
import { hashPassword } from '../src/lib/security';

const STUDENTS = Number(process.env.PERF_STUDENTS ?? 300);
const DAYS = Number(process.env.PERF_DAYS ?? 120);

async function main() {
  if (!process.env.DATABASE_URL?.includes('perf')) {
    throw new Error('Refusing to run: DATABASE_URL must point to a *perf* database');
  }
  const prisma = createPrismaClient(process.env.DATABASE_URL, 4);
  const trainer = await prisma.user.findUniqueOrThrow({ where: { username: 'trainer1' } });
  const gen = await prisma.generation.upsert({
    where: { name: 'Perf Generation' },
    update: {},
    create: { name: 'Perf Generation' },
  });
  const classes = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      prisma.class.upsert({
        where: { generationId_name: { generationId: gen.id, name: `Perf ${i + 1}` } },
        update: {},
        create: { name: `Perf ${i + 1}`, generationId: gen.id },
      }),
    ),
  );
  const books = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      prisma.libraryBook.create({
        data: {
          title: `Perf Book ${i}`,
          normalizedKey: normalizedBookKey(`Perf Book ${i} ${randomUUID()}`),
          totalPages: 300,
        },
      }),
    ),
  );
  const passwordHash = await hashPassword(process.env.SEED_DEFAULT_PASSWORD ?? 'Password123!');

  const users = Array.from({ length: STUDENTS }, (_, i) => ({
    id: randomUUID(),
    role: 'STUDENT' as const,
    username: `perf${i}`,
    studentCode: `P-${String(i).padStart(5, '0')}`,
    fullName: `Perf Student ${i}`,
    classId: classes[i % classes.length]!.id,
    passwordHash,
  }));
  await prisma.user.createMany({ data: users, skipDuplicates: true });
  await prisma.trainerStudentAssignment.createMany({
    data: users.map((u) => ({ trainerId: trainer.id, studentId: u.id })),
    skipDuplicates: true,
  });

  const today = Date.UTC(2026, 9, 27);
  let sessionCount = 0;
  for (const u of users) {
    const sbs = books.slice(0, 3).map((b) => ({
      id: randomUUID(),
      studentId: u.id,
      libraryBookId: b.id,
      status: 'READING' as const,
    }));
    await prisma.studentBook.createMany({ data: sbs });
    const sessions = [];
    for (let d = DAYS; d >= 1; d--) {
      if (Math.random() > 0.7) continue;
      const date = new Date(today - d * 86_400_000);
      const start = new Date(date.getTime() + 2 * 3_600_000);
      const minutes = 5 + Math.floor(Math.random() * 40);
      sessions.push({
        studentId: u.id,
        studentBookId: sbs[d % 3]!.id,
        status: 'COMPLETED' as const,
        startedAt: start,
        endedAt: new Date(start.getTime() + minutes * 60_000),
        durationSeconds: minutes * 60,
        readingDate: date,
        startPage: 10,
        endPage: 10 + Math.floor(minutes / 2),
      });
    }
    await prisma.readingSession.createMany({ data: sessions });
    sessionCount += sessions.length;
  }
  await prisma.$executeRawUnsafe('ANALYZE');
  console.warn(`Perf seed: ${STUDENTS} students, ${sessionCount} sessions.`);
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
