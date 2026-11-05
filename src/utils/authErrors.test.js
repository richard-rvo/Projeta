import { describe, it, expect } from 'vitest';
import { authErrorMessage, isTransientAuthError } from './authErrors';

describe('authErrorMessage', () => {
  it('traduz same_password', () => {
    expect(authErrorMessage({ code: 'same_password', message: 'New password should be different' })).toBe('A nova senha precisa ser diferente da atual.');
  });
  it('traduz weak_password', () => {
    expect(authErrorMessage({ code: 'weak_password' })).toBe('Senha fraca: use pelo menos 10 caracteres, com letras e números.');
  });
  it('traduz limite de taxa (429 e código)', () => {
    const msg = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    expect(authErrorMessage({ status: 429 })).toBe(msg);
    expect(authErrorMessage({ code: 'over_email_send_rate_limit' })).toBe(msg);
  });
  it('traduz erro de rede', () => {
    const msg = 'Sem conexão. Verifique a internet e tente de novo.';
    expect(authErrorMessage({ status: 0 })).toBe(msg);
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 })).toBe(msg);
  });
  it('traduz credenciais inválidas (código e mensagem antiga)', () => {
    const msg = 'E-mail ou senha incorretos.';
    expect(authErrorMessage({ code: 'invalid_credentials', status: 400 })).toBe(msg);
    expect(authErrorMessage({ status: 400, message: 'Invalid login credentials' })).toBe(msg);
  });
  it('traduz e-mail não confirmado', () => {
    expect(authErrorMessage({ code: 'email_not_confirmed', status: 400 }))
      .toBe('Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.');
  });
  it('traduz conta já existente', () => {
    const msg = 'Já existe uma conta com este e-mail.';
    expect(authErrorMessage({ code: 'user_already_exists', status: 422 })).toBe(msg);
    expect(authErrorMessage({ code: 'email_exists', status: 422 })).toBe(msg);
  });
  it('traduz e-mail inválido', () => {
    expect(authErrorMessage({ code: 'email_address_invalid', status: 400 })).toBe('E-mail inválido.');
  });
  it('traduz cadastro desativado', () => {
    expect(authErrorMessage({ code: 'signup_disabled', status: 422 })).toBe('Novos cadastros estão desativados no momento.');
  });
  it('usa mensagem genérica no restante', () => {
    expect(authErrorMessage({ message: 'Something English' })).toBe('Não foi possível concluir. Tente de novo.');
    expect(authErrorMessage(null)).toBe('Não foi possível concluir. Tente de novo.');
  });
});

describe('isTransientAuthError', () => {
  it('é verdadeiro para rede, 429 e 5xx', () => {
    expect(isTransientAuthError({ status: 0 })).toBe(true);
    expect(isTransientAuthError({ status: 429 })).toBe(true);
    expect(isTransientAuthError({ status: 503 })).toBe(true);
  });
  it('é falso para e-mail desconhecido e sem erro', () => {
    expect(isTransientAuthError({ status: 400, code: 'user_not_found' })).toBe(false);
    expect(isTransientAuthError(null)).toBe(false);
  });
});
