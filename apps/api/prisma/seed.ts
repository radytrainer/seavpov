/**
 * DEVELOPMENT seed data. Never run against production (guarded below).
 * Creates generations, classes, categories, catalog books and demo accounts that all share
 * SEED_DEFAULT_PASSWORD. Safe to re-run: existing rows are kept (upserts by unique keys).
 */
import { normalizedBookKey } from '@rt/shared';
import { createPrismaClient } from '../src/plugins/prisma';
import { hashPassword } from '../src/lib/security';
import type { Gender, Role } from '../src/generated/prisma/client';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run the development seed with NODE_ENV=production.');
  process.exit(1);
}
const databaseUrl = process.env.DATABASE_URL;
const password = process.env.SEED_DEFAULT_PASSWORD;
if (!databaseUrl || !password) {
  console.error('DATABASE_URL and SEED_DEFAULT_PASSWORD must be set (see .env.example).');
  process.exit(1);
}

const prisma = createPrismaClient(databaseUrl, 2);

const CATEGORIES = [
  'Fiction',
  'Science',
  'History',
  'Biography',
  'Self-development',
  'Technology',
  'Khmer Literature',
];

const BOOKS: { title: string; author: string; category: string; pages: number; code: string }[] = [
  {
    title: 'The Little Prince',
    author: 'Antoine de Saint-Exupéry',
    category: 'Fiction',
    pages: 96,
    code: 'LIB-0001',
  },
  {
    title: 'A Brief History of Time',
    author: 'Stephen Hawking',
    category: 'Science',
    pages: 212,
    code: 'LIB-0002',
  },
  {
    title: 'Atomic Habits',
    author: 'James Clear',
    category: 'Self-development',
    pages: 320,
    code: 'LIB-0003',
  },
  {
    title: 'Sapiens',
    author: 'Yuval Noah Harari',
    category: 'History',
    pages: 443,
    code: 'LIB-0004',
  },
  {
    title: 'Clean Code',
    author: 'Robert C. Martin',
    category: 'Technology',
    pages: 464,
    code: 'LIB-0005',
  },
  {
    title: 'ទុំទាវ',
    author: 'ព្រះភិក្ខុ សោម',
    category: 'Khmer Literature',
    pages: 120,
    code: 'LIB-0006',
  },
  {
    title: 'Long Walk to Freedom',
    author: 'Nelson Mandela',
    category: 'Biography',
    pages: 656,
    code: 'LIB-0007',
  },
];

async function upsertUser(data: {
  username: string;
  role: Role;
  fullName: string;
  email?: string;
  studentCode?: string;
  gender?: Gender;
  classId?: string;
  passwordHash: string;
}) {
  return prisma.user.upsert({
    where: { username: data.username },
    update: {},
    create: { ...data, mustChangePassword: false },
  });
}

async function main() {
  const passwordHash = await hashPassword(password!);

  const gen2025 = await prisma.generation.upsert({
    where: { name: 'Generation 2025' },
    update: {},
    create: { name: 'Generation 2025', startYear: 2025 },
  });
  const gen2026 = await prisma.generation.upsert({
    where: { name: 'Generation 2026' },
    update: {},
    create: { name: 'Generation 2026', startYear: 2026 },
  });
  const classA = await prisma.class.upsert({
    where: { generationId_name: { generationId: gen2026.id, name: 'Class A' } },
    update: {},
    create: { name: 'Class A', generationId: gen2026.id },
  });
  const classB = await prisma.class.upsert({
    where: { generationId_name: { generationId: gen2026.id, name: 'Class B' } },
    update: {},
    create: { name: 'Class B', generationId: gen2026.id },
  });
  await prisma.class.upsert({
    where: { generationId_name: { generationId: gen2025.id, name: 'Class A' } },
    update: {},
    create: { name: 'Class A', generationId: gen2025.id },
  });

  const categories = new Map<string, string>();
  for (const name of CATEGORIES) {
    const c = await prisma.bookCategory.upsert({ where: { name }, update: {}, create: { name } });
    categories.set(name, c.id);
  }

  const admin = await upsertUser({
    username: 'admin',
    role: 'ADMIN',
    fullName: 'System Administrator',
    email: 'admin@example.edu',
    passwordHash,
  });
  const trainer1 = await upsertUser({
    username: 'trainer1',
    role: 'TRAINER',
    fullName: 'Sokha Chea',
    email: 'trainer1@example.edu',
    passwordHash,
  });
  const trainer2 = await upsertUser({
    username: 'trainer2',
    role: 'TRAINER',
    fullName: 'Dara Lim',
    email: 'trainer2@example.edu',
    passwordHash,
  });

  const students = [
    {
      username: 'student1',
      fullName: 'Srey Neang',
      code: 'S2026-001',
      gender: 'FEMALE',
      classId: classA.id,
    },
    {
      username: 'student2',
      fullName: 'Vannak Heng',
      code: 'S2026-002',
      gender: 'MALE',
      classId: classA.id,
    },
    {
      username: 'student3',
      fullName: 'Bopha Kim',
      code: 'S2026-003',
      gender: 'FEMALE',
      classId: classA.id,
    },
    {
      username: 'student4',
      fullName: 'Rithy Sok',
      code: 'S2026-004',
      gender: 'MALE',
      classId: classB.id,
    },
    {
      username: 'student5',
      fullName: 'ស្រីពៅ ម៉ៅ',
      code: 'S2026-005',
      gender: 'FEMALE',
      classId: classB.id,
    },
  ] as const;

  const studentRows = [];
  for (const s of students) {
    studentRows.push(
      await upsertUser({
        username: s.username,
        role: 'STUDENT',
        fullName: s.fullName,
        email: `${s.username}@example.edu`,
        studentCode: s.code,
        gender: s.gender,
        classId: s.classId,
        passwordHash,
      }),
    );
  }

  // trainer1 → Class A, trainer2 → Class B
  await prisma.trainerStudentAssignment.createMany({
    data: studentRows.map((s, i) => ({
      trainerId: i < 3 ? trainer1.id : trainer2.id,
      studentId: s.id,
    })),
    skipDuplicates: true,
  });

  for (const b of BOOKS) {
    await prisma.libraryBook.upsert({
      where: { libraryCode: b.code },
      update: {},
      create: {
        title: b.title,
        author: b.author,
        normalizedKey: normalizedBookKey(b.title, b.author),
        categoryId: categories.get(b.category),
        totalPages: b.pages,
        libraryCode: b.code,
        createdById: admin.id,
      },
    });
  }

  console.warn(
    `Seed complete. Accounts: admin, trainer1, trainer2, student1..student5 (password from SEED_DEFAULT_PASSWORD).`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
