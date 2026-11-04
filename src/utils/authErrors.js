const FALLBACK = 'Não foi possível concluir. Tente de novo.';

function codeOf(error) {
  return String(error?.code || '').toLowerCase();
}

function isNetwork(error) {
  return error?.status === 0 || error?.name === 'AuthRetryableFetchError' || error instanceof TypeError;
}

function isRateLimit(error) {
  const code = codeOf(error);
  return error?.status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit';
}

/** Erros de rede, limite de taxa ou servidor: o pedido provavelmente não foi processado. */
export function isTransientAuthError(error) {
  if (!error) return false;
  return isNetwork(error) || isRateLimit(error) || (typeof error.status === 'number' && error.status >= 500);
}

export function authErrorMessage(error) {
  const code = codeOf(error);
  if (code === 'same_password') return 'A nova senha precisa ser diferente da atual.';
  if (code === 'weak_password') return 'Senha fraca: use pelo menos 10 caracteres, com letras e números.';
  if (isRateLimit(error)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (isNetwork(error)) return 'Sem conexão. Verifique a internet e tente de novo.';
  return FALLBACK;
}
