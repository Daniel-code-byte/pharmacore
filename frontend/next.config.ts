import type { NextConfig } from 'next';
import path from 'node:path';

// The browser only talks to this Next.js app. Requests to /api/* are
// forwarded to Laravel, so there are no CORS problems and the backend
// address lives in one place (API_URL).
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8000';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
