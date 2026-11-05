/**
 * ICQ New nickname rules, checked on this side before the server sees them
 * (controls/NickLineEdit.cpp, common.shared/constants.h): 5 to 30 characters,
 * a-z, 0-9, dot and underscore, starting with a Latin letter. Stored in lower case.
 */
import { LIMITS } from '@openicq/protocol';
import { S, fmt } from '../../strings';

export type NicknameRule = { ok: true; value: string } | { ok: false; message: string };

const ALLOWED = /^[a-z0-9._]*$/;
const STARTS_WITH_LETTER = /^[a-z]/;

/** Normalises (trim, lower case) and checks one nickname. The empty string is not handled here. */
export function checkNicknameRules(raw: string): NicknameRule {
  const value = raw.trim().toLowerCase();
  if (!ALLOWED.test(value)) return { ok: false, message: S.profile.invalidSymbol };
  if (!STARTS_WITH_LETTER.test(value)) return { ok: false, message: S.profile.startLetter };
  if (value.length < LIMITS.nicknameMin) return { ok: false, message: fmt(S.profile.minLength, LIMITS.nicknameMin) };
  if (value.length > LIMITS.nicknameMax) return { ok: false, message: fmt(S.profile.maxLength, LIMITS.nicknameMax) };
  return { ok: true, value };
}
