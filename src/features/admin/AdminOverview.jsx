import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { getAdminOverview, listAdminUsers } from './adminRepository';
import { formatPercent, formatDateTime } from './format';
import { friendlyDbError } from '../../utils/supabaseRepository';

function Metric({ label, value }) {
  return (
    <div className="flex min-w-36 flex-1 flex-col gap-0.5 bg-surface-1 px-4 py-3">
      <span className="text-micro font-medium uppercase tracking-wide text-text-3">{label}</span>
      <span className={cn('text-[24px] font-semibold leading-none tracking-tight tabular-nums text-text-1')}>{value}</span>
    </div>
  );
}

export default function AdminOverview() {
  const [overview, setOverview] = useState(null);
  const [top, setTop] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getAdminOverview(), listAdminUsers()])
      .then(([o, users]) => {
        if (!alive) return;
        setOverview(o);
        setTop([...users]
          .filter((u) => u.last_activity_at)
          .sort((a, b) => String(b.last_activity_at).localeCompare(String(a.last_activity_at)))
          .slice(0, 5));
      })
      .catch((e) => alive && setError(friendlyDbError(e)));
    return () => { alive = false; };
  }, []);

  if (error) return <p role="alert" className="text-body text-sched-late">{error}</p>;
  if (!overview) return <p className="text-small text-text-2">Carregando…</p>;

  const o = overview;
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Indicadores" className="flex flex-wrap items-stretch gap-px overflow-hidden rounded-[10px] border border-line bg-line">
        <Metric label="Usuários ativos" value={o.users_active} />
        <Metric label="Convites pendentes" value={o.invites_pending} />
        <Metric label="Taxa de aceitação" value={formatPercent(o.acceptance_rate)} />
        <Metric label="Ativos 7 dias" value={o.active_7d} />
        <Metric label="Ativos 30 dias" value={o.active_30d} />
        <Metric label="Projetos" value={o.projects} />
        <Metric label="Tarefas" value={o.tasks} />
        <Metric label="Atas" value={o.minutes} />
        <Metric label="Ações abertas" value={o.actions_open} />
      </section>
      <section className="rounded-[10px] border border-line bg-surface-1 p-4">
        <h2 className="mb-2 text-read font-semibold text-text-1">Usuários mais ativos</h2>
        {top.length === 0 ? (
          <p className="text-small text-text-2">Nenhuma atividade registrada ainda.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {top.map((u) => (
              <li key={u.user_id} className="flex items-center justify-between gap-3 py-2 text-small">
                <span className="min-w-0 truncate text-text-1">{u.display_name || u.email}</span>
                <span className="tabular-nums text-text-2">{formatDateTime(u.last_activity_at)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
