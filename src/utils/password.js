export function validatePassword(password) {
  const value = String(password ?? '');
  if (value.length < 10) return 'Use pelo menos 10 caracteres.';
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Use letras e números.';
  return null;
}
