/** The six default reactions (reactions/DefaultReactions.cpp), emoji built from code points. */
import type { Reaction, ReactionCount } from '@openicq/protocol';
import { S } from '../../strings';

export interface ReactionDef {
  id: Reaction;
  emoji: string;
  label: string;
}

export const REACTION_DEFS: readonly ReactionDef[] = [
  { id: 'like', emoji: String.fromCodePoint(0x1f44d), label: S.reactions.like },
  { id: 'super', emoji: String.fromCodePoint(0x2764, 0xfe0f), label: S.reactions.super },
  { id: 'funny', emoji: String.fromCodePoint(0x1f923), label: S.reactions.funny },
  { id: 'oops', emoji: String.fromCodePoint(0x1f633), label: S.reactions.oops },
  { id: 'sad', emoji: String.fromCodePoint(0x1f622), label: S.reactions.sad },
  { id: 'scandalous', emoji: String.fromCodePoint(0x1f621), label: S.reactions.scandalous },
];

export function reactionDef(id: Reaction): ReactionDef {
  return REACTION_DEFS.find((r) => r.id === id) ?? { id, emoji: '', label: id };
}

/** My current reaction on a message, if any (one per user). */
export function myReaction(reactions: readonly ReactionCount[]): Reaction | null {
  return reactions.find((r) => r.mine)?.reaction ?? null;
}

/** Picking my current reaction again removes it; another one replaces it. */
export function nextReaction(reactions: readonly ReactionCount[], picked: Reaction): Reaction | null {
  return myReaction(reactions) === picked ? null : picked;
}
