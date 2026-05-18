'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { changeRole, removeMember } from './actions';

type Role = 'owner' | 'admin' | 'member' | 'viewer';

interface MemberRowProps {
  member: {
    id:               number;
    email:            string;
    role:             Role;
    invitedAt:        string;
    acceptedAt:       string | null;
    isSelf:           boolean;
    relativeInvited:  string;
  };
  canManage:     boolean;
  canGrantAdmin: boolean;
}

export default function MemberRow({ member, canManage, canGrantAdmin }: MemberRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isOwner    = member.role === 'owner';
  const canEditRow = canManage && !isOwner && !member.isSelf;

  function onChangeRole(next: Role) {
    if (next === member.role) return;
    if (next === 'owner') return;
    setError(null);
    const data = new FormData();
    data.set('memberId', String(member.id));
    data.set('role', next);
    startTransition(async () => {
      try {
        await changeRole(data);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to change role');
      }
    });
  }

  function onRemove() {
    if (!confirm(`Remove ${member.email}? They will lose Cloud access immediately.`)) return;
    setError(null);
    const data = new FormData();
    data.set('memberId', String(member.id));
    startTransition(async () => {
      try {
        await removeMember(data);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove');
      }
    });
  }

  return (
    <tr className="border-b border-[var(--border)] last:border-b-0">
      <td className="px-4 py-3">
        {member.email}
        {member.isSelf && <span className="ml-2 text-xs text-[var(--muted)]">(you)</span>}
      </td>
      <td className="px-4 py-3">
        {canEditRow ? (
          <select
            value={member.role}
            disabled={pending}
            onChange={(e) => onChangeRole(e.target.value as Role)}
            className="bg-[var(--code-bg)] border border-[var(--border)] rounded px-2 py-1 text-xs font-mono"
          >
            {canGrantAdmin && <option value="admin">admin</option>}
            <option value="member">member</option>
            <option value="viewer">viewer</option>
          </select>
        ) : (
          <span className="font-mono text-xs text-[var(--accent)]">{member.role}</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-[var(--muted)]" title={member.invitedAt}>
        {member.relativeInvited}
      </td>
      <td className="px-4 py-3 text-xs text-[var(--muted)]">
        {member.acceptedAt ? 'active' : 'pending'}
      </td>
      <td className="px-4 py-3 text-right">
        {canEditRow ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
          >
            Remove
          </button>
        ) : (
          <span className="text-xs text-[var(--muted)]">—</span>
        )}
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </td>
    </tr>
  );
}
