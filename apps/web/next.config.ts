import path from 'node:path';
import type { NextConfig } from 'next';

// Rewrites are resolved at build time: set API_INTERNAL_URL when building the production image.
// 127.0.0.1, not localhost: on Windows "localhost" tries IPv6 first and the API listens on
// IPv4, which adds ~200 ms to every request.
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4010';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace dependencies from the repository root so @rt/shared is included.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@rt/shared'],
  // The browser calls same-origin /api/v1/*; Next forwards to the API so cookies stay first-party.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
