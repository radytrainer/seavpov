import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { Prisma } from '../generated/prisma/client';

/** Expected, client-facing error. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'FORBIDDEN', message);
/** Also used for records the caller may not see, so existence is not leaked. */
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);

function validationDetails(issues: { path: PropertyKey[]; message: string }[]) {
  return issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, request, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.statusCode)
        .send({ error: { code: err.code, message: err.message, details: err.details } });
    }

    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Some fields are invalid',
          details: err.validation.map((v) => ({
            path: v.instancePath.replace(/^\//, '').replaceAll('/', '.'),
            message: v.message,
          })),
        },
      });
    }

    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Some fields are invalid',
          details: validationDetails(err.issues),
        },
      });
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return reply.status(409).send({
          error: { code: 'DUPLICATE', message: 'A record with these values already exists' },
        });
      }
      if (err.code === 'P2025') {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
      }
    }

    const fastifyErr = err as FastifyError;
    if (fastifyErr.statusCode && fastifyErr.statusCode < 500) {
      // Fastify built-ins (rate limit 429, payload too large 413, bad JSON 400…)
      return reply.status(fastifyErr.statusCode).send({
        error: {
          code: fastifyErr.statusCode === 429 ? 'RATE_LIMITED' : (fastifyErr.code ?? 'BAD_REQUEST'),
          message: fastifyErr.message,
        },
      });
    }

    request.log.error({ err }, 'Unhandled error');
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` },
    });
  });
}
