/** Sign-in and sign-up form checks, run before anything is sent; the server checks again. */
import { LIMITS, emailSchema, registerBodySchema, type LoginBody, type RegisterBody } from '@openicq/protocol';
import { S, fmt } from '../../strings';
import { checkNicknameRules } from '../profile/nickname';

export interface SignInFields {
  login: string;
  password: string;
  keepSignedIn: boolean;
}

export type SignInValidation = { ok: true; body: LoginBody } | { ok: false; field: 'login' | 'password'; message: string };

export function validateSignIn(fields: SignInFields): SignInValidation {
  const login = fields.login.trim();
  if (login === '') return { ok: false, field: 'login', message: S.login.loginRequired };
  if (login.length > LIMITS.email) return { ok: false, field: 'login', message: fmt(S.profile.maxLength, LIMITS.email) };
  if (fields.password === '') return { ok: false, field: 'password', message: S.login.loginRequired };
  if (fields.password.length > LIMITS.passwordMax) {
    return { ok: false, field: 'password', message: fmt(S.profile.maxLength, LIMITS.passwordMax) };
  }
  return { ok: true, body: { login, password: fields.password, keepSignedIn: fields.keepSignedIn } };
}

export interface SignUpFields {
  firstName: string;
  lastName: string;
  nickname: string;
  email: string;
  password: string;
}

export type SignUpField = keyof SignUpFields;
export type SignUpErrors = Partial<Record<SignUpField, string>>;
export type SignUpValidation = { ok: true; body: RegisterBody } | { ok: false; errors: SignUpErrors };

const FIELDS: readonly SignUpField[] = ['firstName', 'lastName', 'nickname', 'email', 'password'];

function isField(value: unknown): value is SignUpField {
  return FIELDS.some((field) => field === value);
}

export function validateSignUp(fields: SignUpFields): SignUpValidation {
  const errors: SignUpErrors = {};
  const firstName = fields.firstName.trim();
  const lastName = fields.lastName.trim();
  const email = fields.email.trim().toLowerCase();
  let nickname: string | null = null;

  if (firstName === '') errors.firstName = S.login.firstNameRequired;
  else if (firstName.length > LIMITS.personName) errors.firstName = fmt(S.profile.maxLength, LIMITS.personName);
  if (lastName.length > LIMITS.personName) errors.lastName = fmt(S.profile.maxLength, LIMITS.personName);
  if (fields.nickname.trim() !== '') {
    const rule = checkNicknameRules(fields.nickname);
    if (rule.ok) nickname = rule.value;
    else errors.nickname = rule.message;
  }
  if (email !== '' && !emailSchema.safeParse(email).success) errors.email = S.login.invalidEmail;
  if (fields.password.length < LIMITS.passwordMin) errors.password = fmt(S.login.passwordTooShort, LIMITS.passwordMin);
  else if (fields.password.length > LIMITS.passwordMax) errors.password = fmt(S.profile.maxLength, LIMITS.passwordMax);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const body: RegisterBody = { firstName, lastName, nickname, email, password: fields.password };
  // The contract schema also rejects control characters; map its first problem to a field.
  const parsed = registerBodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return { ok: false, errors: { [isField(field) ? field : 'firstName']: issue?.message ?? S.login.error } };
  }
  return { ok: true, body };
}
