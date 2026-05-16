// Mirrors site/lib/auth-server.ts — keep in sync until shared/ extraction (v0.7).
import { createNeonAuth } from '@neondatabase/neon-js/auth/next/server';

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});
