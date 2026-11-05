import { LIMITS, registerBodySchema, type RegisterBody } from '@openicq/protocol';

export interface RegistrationFields {
  nickname: string;
  firstName: string;
  lastName: string;
  email: string;
  hideEmail: boolean;
  password: string;
  confirmPassword: string;
  savePassword: boolean;
}

export type RegistrationValidation = { ok: true; body: RegisterBody } | { ok: false; message: string };

/** Original messages from icqreg.dll (strings 11, 14, 15) where one exists. */
export function validateRegistration(fields: RegistrationFields): RegistrationValidation {
  if (fields.nickname.trim() === '') return { ok: false, message: 'Please enter a nickname.' };
  if (fields.password === '') {
    return { ok: false, message: 'You did not select a password. Registration cannot be completed without selecting a password.' };
  }
  if (fields.password.length < LIMITS.passwordMin) {
    return { ok: false, message: `Invalid Password\nThe password must have at least ${LIMITS.passwordMin} characters.` };
  }
  if (fields.password !== fields.confirmPassword) return { ok: false, message: 'Confirm password does not match !' };
  const body = {
    nickname: fields.nickname,
    firstName: fields.firstName,
    lastName: fields.lastName,
    email: fields.email,
    password: fields.password,
    // The server default; the privacy choice is offered after registering, as in the original.
    authRequired: false,
  };
  const parsed = registerBodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    if (field === 'email') return { ok: false, message: 'Not a valid Email address' };
    return { ok: false, message: issue ? `${String(field ?? 'Field')}: ${issue.message}` : 'Invalid details' };
  }
  return { ok: true, body };
}
