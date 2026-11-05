import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ConfirmDialog from '../../components/ConfirmDialog';
import { adminAction, listInvites } from './adminRepository';
import { INVITE_STATUS, formatDateTime } from './format';
import { friendlyDbError } from '../../utils/supabaseRepository';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminInvites() {
  const [invites, setInvites] = useState(null);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message }
  const [toRevoke, setToRevoke] = useState(null);

  const load = useCallback(async () => {
    try {
      setInvites(await listInvites());
    } catch (e) {
      setFeedback({ type: 'error', message: friendlyDbError(e) });
      setInvites((prev) => prev || []);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, successMessage) => {
    setBusy(true);
    setFeedback(null);
    try {
      await fn();
      setFeedback({ type: 'success', message: typeof successMessage === 'function' ? successMessage() : successMessage });
      await load();
      return true;
    } catch (e) {
      setFeedback({ type: 'error', message: friendlyDbError(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setFeedback({ type: 'error', message: 'Informe um e-mail válido.' });
      return;
    }
    let hint = null;
    const ok = await run(async () => {
      const data = await adminAction('invite', { email: normalized, note: note.trim() });
      if (data?.delivered === false) hint = data.message || data.hint || null;
    }, () => hint || `Convite enviado para ${normalized}.`);
    if (ok) { setEmail(''); setNote(''); }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3 rounded-[10px] border border-line bg-surface-1 p-4">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-small text-text-2">
          E-mail
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" />
        </label>
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-small text-text-2">
          Observação
          <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </label>
        <Button type="submit" disabled={busy}>Enviar convite</Button>
      </form>

      {feedback && (
        <p
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={feedback.type === 'error' ? 'text-small text-sched-late' : 'text-small text-sched-done'}
        >
          {feedback.message}
        </p>
      )}

      {invites === null ? (
        <p className="text-small text-text-2">Carregando…</p>
      ) : invites.length === 0 ? (
        <p className="text-small text-text-2">Nenhum convite enviado ainda.</p>
      ) : (
        <Table aria-label="Convites">
          <TableHeader>
            <TableRow>
              <TableHead>E-mail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Enviado em</TableHead>
              <TableHead>Envios</TableHead>
              <TableHead>Expira em</TableHead>
              <TableHead>Último erro</TableHead>
              <TableHead><span className="sr-only">Ações</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((invite) => {
              const st = INVITE_STATUS[invite.display_status] || INVITE_STATUS.pending;
              const actionable = invite.display_status === 'pending' || invite.display_status === 'expired';
              return (
                <TableRow key={invite.id}>
                  <TableCell className="text-text-1">{invite.email}</TableCell>
                  <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                  <TableCell className="tabular-nums">{formatDateTime(invite.last_sent_at || invite.created_at)}</TableCell>
                  <TableCell className="tabular-nums">{invite.sent_count}</TableCell>
                  <TableCell className="tabular-nums">{formatDateTime(invite.expires_at)}</TableCell>
                  <TableCell className="max-w-64 truncate text-text-2" title={invite.last_error || undefined}>{invite.last_error || '—'}</TableCell>
                  <TableCell>
                    {actionable && (
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="sm" variant="ghost" disabled={busy}
                          aria-label={`Reenviar convite para ${invite.email}`}
                          onClick={() => run(() => adminAction('resend', { inviteId: invite.id }), `Convite reenviado para ${invite.email}.`)}>
                          Reenviar
                        </Button>
                        <Button type="button" size="sm" variant="destructiveGhost" disabled={busy}
                          aria-label={`Revogar convite de ${invite.email}`}
                          onClick={() => setToRevoke(invite)}>
                          Revogar
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        isOpen={Boolean(toRevoke)}
        onClose={() => setToRevoke(null)}
        title="Revogar convite"
        message={toRevoke ? `O convite para ${toRevoke.email} deixará de valer.` : ''}
        confirmLabel="Revogar convite"
        onConfirm={() => run(() => adminAction('revoke_invite', { inviteId: toRevoke.id }), 'Convite revogado.')}
      />
    </div>
  );
}
