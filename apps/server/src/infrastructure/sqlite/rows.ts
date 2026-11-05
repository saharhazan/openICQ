/**
 * Typed column readers. A column with an unexpected type means the schema
 * and the code disagree, so it fails loudly instead of guessing.
 */
import type { SQLOutputValue } from 'node:sqlite';

export type Row = Record<string, SQLOutputValue>;

function mismatch(column: string, expected: string, value: SQLOutputValue | undefined): Error {
  return new Error(`Column "${column}" holds ${value === null ? 'null' : typeof value}, expected ${expected}`);
}

export function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') throw mismatch(column, 'text', value);
  return value;
}

export function optionalText(row: Row, column: string): string | null {
  const value = row[column];
  if (value === null) return null;
  if (typeof value !== 'string') throw mismatch(column, 'text or null', value);
  return value;
}

export function integer(row: Row, column: string): number {
  const value = row[column];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw mismatch(column, 'integer', value);
  return value;
}

export function optionalInteger(row: Row, column: string): number | null {
  const value = row[column];
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) throw mismatch(column, 'integer or null', value);
  return value;
}

export function flag(row: Row, column: string): boolean {
  const value = integer(row, column);
  if (value !== 0 && value !== 1) throw mismatch(column, '0 or 1', value);
  return value === 1;
}

export function toFlag(value: boolean): number {
  return value ? 1 : 0;
}

/** A row that must exist, for example the result of INSERT ... RETURNING. */
export function required(row: Row | undefined, what: string): Row {
  if (row === undefined) throw new Error(`Expected a row for ${what}`);
  return row;
}

export function jsonObject(row: Row, column: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text(row, column));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Column "${column}" does not hold a JSON object`);
  }
  return { ...parsed };
}
