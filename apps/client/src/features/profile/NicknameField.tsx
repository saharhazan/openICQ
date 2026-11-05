/**
 * The nickname field of the profile (EditNicknameWidget.cpp): local rules at
 * once, then the server check a second after typing stops ("Checking...",
 * "Nickname available", "This nickname is taken").
 */
import { useEffect, useState } from 'react';
import { LIMITS } from '@openicq/protocol';
import { useServices } from '../../app/AppContext';
import type { NicknameCheck } from '../../app/AccountCommands';
import { S } from '../../strings';
import { TextField } from '../../ui/controls';
import { checkNicknameRules } from './nickname';

export const NICKNAME_CHECK_DELAY_MS = 1_000;

export type NicknameStatus =
  /** Same as the saved nickname. */
  | { kind: 'unchanged' }
  /** Cleared: saving removes the nickname. */
  | { kind: 'empty' }
  | { kind: 'rule'; message: string }
  | { kind: 'checking'; value: string }
  | { kind: 'server'; value: string; result: NicknameCheck };

/** The live status of a nickname being edited, with the debounced nickname.check. */
export function useNicknameCheck(value: string, current: string | null): NicknameStatus {
  const { account } = useServices();
  const [checked, setChecked] = useState<{ value: string; result: NicknameCheck } | null>(null);
  const normalized = value.trim().toLowerCase();
  const rule = normalized === '' ? null : checkNicknameRules(normalized);
  const candidate = rule?.ok && normalized !== (current ?? '') ? rule.value : null;

  useEffect(() => {
    if (candidate === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void account.checkNickname(candidate).then((result) => {
        if (!cancelled) setChecked({ value: candidate, result });
      });
    }, NICKNAME_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candidate, account]);

  if (normalized === (current ?? '')) return { kind: 'unchanged' };
  if (normalized === '') return { kind: 'empty' };
  if (rule && !rule.ok) return { kind: 'rule', message: rule.message };
  if (candidate !== null && checked?.value === candidate) return { kind: 'server', value: candidate, result: checked.result };
  return { kind: 'checking', value: normalized };
}

/** Whether Save may send the nickname (an available one, or removing it). */
export function canSaveNickname(status: NicknameStatus): boolean {
  return status.kind === 'empty' || (status.kind === 'server' && status.result === 'available');
}

function statusText(status: NicknameStatus): { error: string | null; hint: string | null; ok: boolean } {
  switch (status.kind) {
    case 'rule':
      return { error: status.message, hint: null, ok: false };
    case 'checking':
      return { error: null, hint: S.profile.checking, ok: false };
    case 'server':
      if (status.result === 'available') return { error: null, hint: S.profile.available, ok: true };
      if (status.result === 'taken') return { error: S.profile.taken, hint: null, ok: false };
      if (status.result === 'invalid') return { error: S.profile.invalid, hint: null, ok: false };
      return { error: S.profile.serverError, hint: null, ok: false };
    default:
      return { error: null, hint: null, ok: false };
  }
}

export interface NicknameFieldProps {
  value: string;
  onChange: (value: string) => void;
  status: NicknameStatus;
  autoFocus?: boolean;
}

export function NicknameField({ value, onChange, status, autoFocus }: NicknameFieldProps) {
  const text = statusText(status);
  return (
    <TextField
      label={S.profile.nickname}
      value={value}
      onChange={(next) => onChange(next.toLowerCase())}
      maxLength={LIMITS.nicknameMax * 2}
      autoFocus={autoFocus}
      autoComplete="off"
      error={text.error}
      hint={text.hint ? <span className={text.ok ? 'success-text' : undefined}>{text.hint}</span> : undefined}
    />
  );
}
