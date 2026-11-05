import { describe, expect, it } from 'vitest';
import { checkNicknameRules } from './nickname';

describe('checkNicknameRules', () => {
  it.each([
    ['anna', 'Minimum length - 5 symbols'],
    ['a'.repeat(31), 'Maximum length - 30 symbols'],
    ['1anna', 'Nicknames must start with a letter of the roman alphabet (a-z)'],
    ['_anna', 'Nicknames must start with a letter of the roman alphabet (a-z)'],
    ['anna-k', 'Invalid character'],
    ['anna k', 'Invalid character'],
    ['ann\u0430.k', 'Invalid character'],
  ])('refuses %s', (raw, message) => {
    expect(checkNicknameRules(raw)).toEqual({ ok: false, message });
  });

  it('accepts letters, digits, dot and underscore, in lower case', () => {
    expect(checkNicknameRules('  Anna.K_99 ')).toEqual({ ok: true, value: 'anna.k_99' });
  });

  it('accepts exactly 5 and 30 characters', () => {
    expect(checkNicknameRules('abcde')).toMatchObject({ ok: true });
    expect(checkNicknameRules('a'.repeat(30))).toMatchObject({ ok: true });
  });
});
