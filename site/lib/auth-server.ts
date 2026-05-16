import { createNeonAuth } from '@neondatabase/neon-js/auth/next/server';

// Share session cookies across agorio.dev and cloud.agorio.dev in production
// so users signed in on either subdomain are seamlessly authenticated on the
// other. Leave undefined in dev/preview so localhost and *.vercel.app keep
// working (browsers reject explicit domains they don't actually serve).
const cookieDomain =
  process.env.VERCEL_ENV === 'production' ? '.agorio.dev' : undefined;

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  },
});
