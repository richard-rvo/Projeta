const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** dd/mm/aaaa hh:mm (pt-BR). */
export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return dateFmt.format(d).replace(',', '');
}

export function formatPercent(rate) {
  return `${Math.round((Number(rate) || 0) * 100)}%`;
}

export function formatMB(bytes) {
  return `${((Number(bytes) || 0) / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export const INVITE_STATUS = {
  pending: { label: 'Pendente', variant: 'atRisk' },
  expired: { label: 'Expirado', variant: 'neutral' },
  accepted: { label: 'Aceito', variant: 'done' },
  revoked: { label: 'Revogado', variant: 'late' },
};
