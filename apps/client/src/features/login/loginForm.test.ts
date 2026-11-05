import { describe, expect, it } from 'vitest';
import { validateLogin } from './loginForm';

describe('validateLogin', () => {
  const ok = { uin: '100001', password: 'secret1', savePassword: true };

  it('builds the login body with Save password mapped to remember', () => {
    expect(validateLogin(ok)).toEqual({ ok: true, body: { uin: 100001, password: 'secret1', remember: true } });
  });

  it('trims the ICQ# but keeps the password as typed', () => {
    expect(validateLogin({ ...ok, uin: ' 100001 ', password: ' pw ' })).toMatchObject({ ok: true, body: { uin: 100001, password: ' pw ' } });
  });

  it.each([
    [{ ...ok, uin: '' }, 'uin'],
    [{ ...ok, uin: '12a45' }, 'uin'],
    [{ ...ok, uin: '99' }, 'uin'],
    [{ ...ok, uin: '99999999999' }, 'uin'],
    [{ ...ok, password: '' }, 'password'],
    [{ ...ok, password: 'x'.repeat(65) }, 'password'],
  ])('rejects %j', (fields, field) => {
    expect(validateLogin(fields)).toMatchObject({ ok: false, field });
  });
});
