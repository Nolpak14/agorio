'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { inviteMember } from './actions';

export default function InviteMemberForm({ canGrantAdmin }: { canGrantAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen]    = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError]  = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-lg text-sm border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
      >
        + Invite member
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const form = e.currentTarget;
        const data = new FormData(form);
        startTransition(async () => {
          try {
            await inviteMember(data);
            setOpen(false);
            form.reset();
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Invite failed');
          }
        });
      }}
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 mb-4 space-y-4"
    >
      <div>
        <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
          Email
        </label>
        <input
          name="email"
          type="email"
          required
          placeholder="teammate@example.com"
          className="w-full px-3 py-2 rounded-lg bg-[var(--code-bg)] border border-[var(--border)] focus:border-[var(--accent)] outline-none text-sm"
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
          Role
        </label>
        <select
          name="role"
          defaultValue="member"
          className="w-full px-3 py-2 rounded-lg bg-[var(--code-bg)] border border-[var(--border)] focus:border-[var(--accent)] outline-none text-sm"
        >
          {canGrantAdmin && <option value="admin">admin — manage team, API keys, billing</option>}
          <option value="member">member — view traces, audit log</option>
          <option value="viewer">viewer — read-only</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-lg text-sm text-black font-semibold transition-all disabled:opacity-50 hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]"
          style={{ background: 'linear-gradient(135deg, var(--accent), #00c8d4)' }}
        >
          {pending ? 'Sending…' : 'Send invite'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          disabled={pending}
          className="px-4 py-2 rounded-lg text-sm border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
