import { redirect } from 'next/navigation';

// Legacy entrypoint. The canonical auth surface is /auth/<pathname>.
// Kept as a redirect for any external bookmarks or older docs that still
// point at /login.
export default function LoginRedirect(): never {
  redirect('/auth/sign-in');
}
