import React, { useCallback, useContext, useEffect, useState } from 'react';
import { AppContext } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ConfirmDialog from '../../components/ConfirmDialog';
import { adminAction, listAdminUsers, listInvites } from './adminRepository';
import { USER_STATUS, formatDateTime, formatMB } from './format';
import { friendlyDbError } from '../../utils/supabaseRepository';

export default function AdminUsers() {
  const { state } = useContext(AppContext);
  const selfId = state.auth?.user?.id;
  const [users, setUsers] = useState(null);
  const [pendingInvites, setPendingInvites] = useState({}); // email -> id
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [pending, setPending] = useState(null); // { user, action }

  const load = useCallback(async () => {
    try {
      setUsers(await listAdminUsers());
    } catch (e) {
      setFeedback({ type: 'error', message: friendlyDbError(e) });
      setUsers((prev) => prev || []);
    }
  }, []);
  const loadInvites = useCallback(async () => {
    try {
      const rows = await listInvites();
      const map = {};
      for (const i of rows) if (i.display_status === 'pending' || i.display_status === 'expired') map[i.email] = i.id;
      setPendingInvites(map);
    } catch { setPendingInvites({}); }
  }, []);
  useEffect(() => { load(); loadInvites(); }, [load, loadInvites]);

  const resend = async (user, inviteId) => {
    setBusy(true);
    setFeedback(null);
    try {
      await adminAction('resend', { inviteId });
      setFeedback({ type: 'success', message: `Convite reenviado para ${user.email}.` });
      await loadInvites();
    } catch (e) {
      setFeedback({ type: 'error', message: friendlyDbError(e) });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    const { user, action } = pending;
    setBusy(true);
    setFeedback(null);
    try {
      await adminAction(action, { userId: user.user_id });
      setFeedback({ type: 'success', message: action === 'revoke_user' ? 'Acesso revogado.' : 'Acesso restaurado.' });
      await load();
    } catch (e) {
      setFeedback({ type: 'error', message: friendlyDbError(e) });
    } finally {
      setBusy(false);
    }
  };

  if (users === null) return <p className="text-small text-text-2">Carregando…</p>;

  const revoking = pending?.action === 'revoke_user';
  return (
    <div className="flex flex-col gap-3">
      {feedback && (
        <p role={feedback.type === 'error' ? 'alert' : 'status'}
          className={feedback.type === 'error' ? 'text-small text-sched-late' : 'text-small text-sched-done'}>
          {feedback.message}
        </p>
      )}
      <Table aria-label="Usuários">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Admin</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead>Último acesso</TableHead>
            <TableHead>Projetos</TableHead>
            <TableHead>Tarefas</TableHead>
            <TableHead>Atas</TableHead>
            <TableHead>Anomalias</TableHead>
            <TableHead>Última atividade</TableHead>
            <TableHead>Fotos</TableHead>
            <TableHead><span className="sr-only">Ações</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const isSelf = u.user_id === selfId;
            const locked = isSelf || u.is_admin;
            const revoked = u.status === 'revoked';
            const active = !revoked;
            const st = USER_STATUS[u.status] || USER_STATUS.active;
            const inviteId = u.status === 'invited' ? pendingInvites[u.email] : null;
            return (
              <TableRow key={u.user_id}>
                <TableCell className="text-text-1">{u.display_name || '—'}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </TableCell>
                <TableCell>{u.is_admin ? 'Sim' : 'Não'}</TableCell>
                <TableCell className="tabular-nums">{formatDateTime(u.created_at)}</TableCell>
                <TableCell className="tabular-nums">{formatDateTime(u.last_sign_in_at)}</TableCell>
                <TableCell className="tabular-nums">{u.projects}</TableCell>
                <TableCell className="tabular-nums">{u.tasks}</TableCell>
                <TableCell className="tabular-nums">{u.minutes}</TableCell>
                <TableCell className="tabular-nums">{u.anomalies}</TableCell>
                <TableCell className="tabular-nums">{formatDateTime(u.last_activity_at)}</TableCell>
                <TableCell className="tabular-nums">{formatMB(u.photos_bytes)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                  {inviteId && (
                    <Button type="button" size="sm" variant="ghost" disabled={busy}
                      aria-label={`Reenviar convite para ${u.email}`}
                      onClick={() => resend(u, inviteId)}>
                      Reenviar convite
                    </Button>
                  )}
                  <Button
                    type="button" size="sm"
                    variant={active ? 'destructiveGhost' : 'ghost'}
                    disabled={busy || locked}
                    title={locked ? 'Não é possível alterar o acesso de si mesmo ou de administradores.' : undefined}
                    aria-label={`${active ? 'Revogar' : 'Restaurar'} acesso de ${u.email}`}
                    onClick={() => setPending({ user: u, action: active ? 'revoke_user' : 'restore_user' })}
                  >
                    {active ? 'Revogar' : 'Restaurar'}
                  </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ConfirmDialog
        isOpen={Boolean(pending)}
        onClose={() => setPending(null)}
        title={revoking ? 'Revogar acesso' : 'Restaurar acesso'}
        message={pending ? (revoking
          ? `${pending.user.email} perderá o acesso ao Projeta imediatamente. Os dados são mantidos.`
          : `${pending.user.email} voltará a acessar o Projeta.`) : ''}
        confirmLabel={revoking ? 'Revogar acesso' : 'Restaurar acesso'}
        onConfirm={confirm}
      />
    </div>
  );
}
