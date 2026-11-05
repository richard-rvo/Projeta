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

const MESSAGES = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  email_exists: 'Já existe uma conta com este e-mail.',
  email_address_invalid: 'E-mail inválido.',
  signup_disabled: 'Novos cadastros estão desativados no momento.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  weak_password: 'Senha fraca: use pelo menos 10 caracteres, com letras e números.',
};

export function authErrorMessage(error) {
  const code = codeOf(error);
  if (Object.hasOwn(MESSAGES, code)) return MESSAGES[code];
  // Servidores antigos do GoTrue mandam só a mensagem, sem código.
  if (/invalid login credentials/i.test(String(error?.message || ''))) return MESSAGES.invalid_credentials;
  if (isRateLimit(error)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (isNetwork(error)) return 'Sem conexão. Verifique a internet e tente de novo.';
  return FALLBACK;
}
