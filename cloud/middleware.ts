import { auth } from '@/lib/auth-server';

export default auth.middleware({ loginUrl: '/auth/sign-in' });

// Server-action POSTs to /api-keys (Next.js sends the action body as POST
// to the page route) were being intercepted by Neon Auth middleware,
// resulting in "An unexpected response was received from the server" on
// the client. The /api-keys page does its own auth check via
// getCurrentCustomer(), and the actions check via auth.getSession(), so
// middleware protection here is redundant and harmful. /traces stays
// covered for the GET-side redirect ergonomics.
export const config = {
  matcher: ['/traces/:path*'],
};
