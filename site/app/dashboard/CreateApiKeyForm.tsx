'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createApiKey } from './actions';

export default function CreateApiKeyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-lg text-sm border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
      >
        + Create API key
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
            const created = await createApiKey(data);
            setOpen(false);
            form.reset();
            router.replace(`/dashboard?created=${encodeURIComponent(created.key)}#api-keys`);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create key');
          }
        });
      }}
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 mb-4 space-y-4"
    >
      <div>
        <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
          Label
        </label>
        <input
          name="label"
          required
          maxLength={100}
          placeholder="e.g. local dev, CI, production agents"
          className="w-full px-3 py-2 rounded-lg bg-[var(--code-bg)] border border-[var(--border)] focus:border-[var(--accent)] outline-none text-sm"
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
          Environment
        </label>
        <select
          name="env"
          defaultValue="prod"
          className="w-full px-3 py-2 rounded-lg bg-[var(--code-bg)] border border-[var(--border)] focus:border-[var(--accent)] outline-none text-sm"
        >
          <option value="prod">prod</option>
          <option value="dev">dev</option>
          <option value="test">test</option>
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
          {pending ? 'Creating…' : 'Create key'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={pending}
          className="px-4 py-2 rounded-lg text-sm border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
