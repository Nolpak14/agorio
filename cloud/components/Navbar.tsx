import Link from 'next/link';

export default function CloudNavbar({ email }: { email?: string }) {
  return (
    <header className="cloud-nav">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/traces" className="flex items-center gap-2 font-semibold">
          <span className="text-[var(--accent)]">Agorio</span>
          <span className="text-[var(--muted)] text-sm">Cloud</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/traces" className="hover:text-[var(--accent)] transition-colors">
            Traces
          </Link>
          <Link
            href="https://agorio.dev/dashboard"
            className="hover:text-[var(--accent)] transition-colors"
          >
            API keys
          </Link>
          {email && <span className="text-[var(--muted)]">{email}</span>}
        </nav>
      </div>
    </header>
  );
}
