import fp from 'fastify-plugin';
import { AppError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests (in addition to SameSite=Lax cookies):
 * 1. State-changing requests must carry `X-Requested-With: fetch`. Browsers do not let
 *    cross-site forms set custom headers, and cross-origin fetch would need a CORS preflight
 *    that this API never approves.
 * 2. If an Origin header is present it must match APP_ORIGIN.
 */
export const csrfPlugin = fp<{ appOrigin: string }>(async (app, opts) => {
  const allowedOrigin = new URL(opts.appOrigin).origin;

  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (!request.url.startsWith('/api/')) return;

    if (request.headers['x-requested-with'] !== 'fetch') {
      throw new AppError(403, 'CSRF_REJECTED', 'Missing required request header');
    }
    const origin = request.headers.origin;
    if (origin && origin !== allowedOrigin) {
      throw new AppError(403, 'CSRF_REJECTED', 'Request origin is not allowed');
    }
  });
});
