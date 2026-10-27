/**
 * PRODUCTION bootstrap. Ensures the settings row exists and creates the first administrator
 * if no administrator exists yet. Idempotent; never creates demo data.
 *
 * Required env: DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_FULL_NAME
 * Optional env: ADMIN_EMAIL
 * The administrator must change the password at first sign-in.
 */
import { passwordSchema, usernameSchema } from '@rt/shared';
import { createPrismaClient } from '../src/plugins/prisma';
import { hashPassword } from '../src/lib/security';

async function main() {
  const { DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_FULL_NAME, ADMIN_EMAIL } =
    process.env;
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

  const prisma = createPrismaClient(DATABASE_URL, 1);
  try {
    await prisma.systemSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    if (existingAdmin) {
      console.warn('An administrator already exists; nothing to do.');
      return;
    }
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !ADMIN_FULL_NAME) {
      throw new Error(
        'ADMIN_USERNAME, ADMIN_PASSWORD and ADMIN_FULL_NAME are required for the first admin',
      );
    }
    const username = usernameSchema.parse(ADMIN_USERNAME);
    passwordSchema.parse(ADMIN_PASSWORD);

    await prisma.user.create({
      data: {
        role: 'ADMIN',
        username,
        fullName: ADMIN_FULL_NAME,
        email: ADMIN_EMAIL?.toLowerCase() || null,
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        mustChangePassword: true,
      },
    });
    console.warn(`Created administrator "${username}". Change the password at first sign-in.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
