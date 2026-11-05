import { describe, expect, it } from 'vitest';
import { validateSignIn, validateSignUp } from './authForms';

describe('validateSignIn', () => {
  it('asks for the login first', () => {
    expect(validateSignIn({ login: '   ', password: 'secret', keepSignedIn: true })).toEqual({
      ok: false,
      field: 'login',
      message: 'Enter your login and password',
    });
  });

  it('asks for the password', () => {
    expect(validateSignIn({ login: '100001', password: '', keepSignedIn: true })).toMatchObject({ ok: false, field: 'password' });
  });

  it('refuses a password longer than the contract allows', () => {
    expect(validateSignIn({ login: '100001', password: 'x'.repeat(65), keepSignedIn: true })).toEqual({
      ok: false,
      field: 'password',
      message: 'Maximum length - 64 symbols',
    });
  });

  it('builds the login body with a trimmed login and the keep flag', () => {
    expect(validateSignIn({ login: '  me@example.com ', password: ' pass ', keepSignedIn: false })).toEqual({
      ok: true,
      body: { login: 'me@example.com', password: ' pass ', keepSignedIn: false },
    });
  });
});

describe('validateSignUp', () => {
  const valid = { firstName: 'Anna', lastName: '', nickname: '', email: '', password: 'secret1' };

  it('requires a first name', () => {
    const result = validateSignUp({ ...valid, firstName: '  ' });
    expect(result).toEqual({ ok: false, errors: { firstName: 'First name is required' } });
  });

  it('requires a password of at least 6 characters', () => {
    const result = validateSignUp({ ...valid, password: '12345' });
    expect(result).toEqual({ ok: false, errors: { password: 'Minimum length - 6 symbols' } });
  });

  it('checks the optional email and nickname only when given', () => {
    const result = validateSignUp({ ...valid, email: 'not-an-email', nickname: '9lives' });
    expect(result).toEqual({
      ok: false,
      errors: { email: 'Wrong Email', nickname: 'Nicknames must start with a letter of the roman alphabet (a-z)' },
    });
  });

  it('sends null and empty values for the optional fields', () => {
    expect(validateSignUp({ ...valid, lastName: ' Ivanova ' })).toEqual({
      ok: true,
      body: { firstName: 'Anna', lastName: 'Ivanova', nickname: null, email: '', password: 'secret1' },
    });
  });

  it('normalises nickname and email to lower case', () => {
    const result = validateSignUp({ ...valid, nickname: ' Anna.K ', email: 'Anna@Example.COM' });
    expect(result).toMatchObject({ ok: true, body: { nickname: 'anna.k', email: 'anna@example.com' } });
  });

  it('maps a control character to its field through the contract schema', () => {
    const result = validateSignUp({ ...valid, lastName: 'bad\u0007name' });
    expect(result).toMatchObject({ ok: false, errors: { lastName: 'Control characters are not allowed' } });
  });
});
