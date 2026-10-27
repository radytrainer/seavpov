import type { PrismaClient, SystemSettings } from '../generated/prisma/client';

const TTL_MS = 30_000;
let cached: { value: SystemSettings; at: number } | null = null;

/**
 * Institution settings (single row). Cached briefly because nearly every reading request needs
 * the time zone; updates through the settings service call `invalidateSettings()`.
 */
export async function getSettings(prisma: PrismaClient): Promise<SystemSettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  cached = { value, at: Date.now() };
  return value;
}

export function invalidateSettings(): void {
  cached = null;
}
