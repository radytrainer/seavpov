import type { FastifyRequest } from 'fastify';
import type { Prisma, PrismaClient } from '../generated/prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Non-sensitive context only. Never include passwords, tokens or reflection text. */
  metadata?: Prisma.InputJsonValue;
}

export async function audit(
  db: Db,
  request: FastifyRequest | null,
  entry: AuditEntry,
  actorId: string | null = request?.auth?.userId ?? null,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
      ip: request?.ip ?? null,
    },
  });
}
