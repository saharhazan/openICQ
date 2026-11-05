import { LIMITS, uinSchema, type LoginBody } from '@openicq/protocol';

export interface LoginFields {
  uin: string;
  password: string;
  savePassword: boolean;
}

export type LoginValidation = { ok: true; body: LoginBody } | { ok: false; field: 'uin' | 'password'; message: string };

/** Checks the login form before anything is sent; the server checks again. */
export function validateLogin(fields: LoginFields): LoginValidation {
  const uinText = fields.uin.trim();
  if (uinText === '') return { ok: false, field: 'uin', message: 'Please enter your ICQ#.' };
  if (!/^\d+$/.test(uinText)) return { ok: false, field: 'uin', message: 'An ICQ# contains digits only.' };
  const uin = uinSchema.safeParse(Number(uinText));
  if (!uin.success) return { ok: false, field: 'uin', message: 'This ICQ# does not exist' };
  if (fields.password === '') return { ok: false, field: 'password', message: 'Please enter your password.' };
  if (fields.password.length > LIMITS.passwordMax) {
    return { ok: false, field: 'password', message: `The password is longer than ${LIMITS.passwordMax} characters.` };
  }
  return { ok: true, body: { uin: uin.data, password: fields.password, remember: fields.savePassword } };
}
