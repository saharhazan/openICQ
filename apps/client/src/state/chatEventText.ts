/**
 * Group service messages, worded with the original `chat_event` strings
 * (gui/main_window/history_control/ChatEventInfo.cpp). The leading %1 of
 * membership events is an emoji in the original; it is built here from
 * code points so the source holds no emoji characters.
 */
import { fmt } from '../strings';
import type { ChatEvent, Uin } from './protocolTypes';

const DOOR = String.fromCodePoint(0x1f6aa);
const WAVING_HAND = String.fromCodePoint(0x1f44b);
const CROSS_MARK = String.fromCodePoint(0x274c);
const MAN_WALKING = String.fromCodePoint(0x1f6b6, 0x200d, 0x2642, 0xfe0f);

const T = {
  you: 'you',
  joined: '%1 You have joined the group',
  hasJoined: '%1 %2 joined the group',
  added: '%1 You added %2 to the group',
  hasAdded: '%1 %2 added %3 to the group',
  removedYou: '%1 %2 deleted you',
  youRemoved: '%1 You have deleted %2',
  removed: '%1 %2 deleted %3',
  youLeft: '%1 You left the group',
  hasLeft: '%1 %2 has left group (this message is visible only to administrators)',
  youAssignedAdmin: 'You assigned %1 administrator of this group',
  youWereAssigned: 'You were assigned as an administrator of this group',
  assignedAdmin: '%1 assigned %2 administrator of this group',
  youNoLongerAdmin: 'You are no longer the administrator of this group',
  youRevoked: 'You have removed administrator rights from %1',
  revoked: '%1 withdrew admin rights with %2',
  bannedYou: '%1 banned you from writing',
  youBanned: 'You have forbidden to write %1',
  banned: '%1 prohibited (s) writing %2',
  youRenamed: 'You entered a new group name - "%1"',
  renamed: '%1 indicated a new group name - "%2"',
  youDeletedAbout: 'You deleted the group description',
  deletedAbout: '%1 deleted the group description',
  youChangedAbout: 'You changed the group description - "%1"',
  changedAbout: '%1 changed the group description - "%2"',
  youDeletedRules: 'You deleted the group rules',
  deletedRules: '%1 deleted the group rules',
  youChangedRules: 'You changed the group rules - "%1"',
  changedRules: '%1 changed the group rules - "%2"',
  youChangedAvatar: 'You changed the group avatar',
  changedAvatar: '%1 changed the group avatar',
  youChangedLink: 'You changed the link to %1',
  changedLink: '%1 changed the link to %2',
  youEnabledApproval: 'You enabled join with approval',
  youDisabledApproval: 'You turned off group membership on request',
  enabledApproval: '%1 enabled join with approval',
  disabledApproval: '%1 disabled join with approval',
  /** openICQ: the original server sent no creation event; worded like the others. */
  youCreated: 'You created the group "%1"',
  created: '%1 created the group "%2"',
} as const;

export interface EventNames {
  me: Uin;
  /** Display name of any user. */
  name(uin: Uin): string;
}

function isOn(value: string | null): boolean {
  return value === 'true' || value === '1' || value === 'on';
}

function roleText(event: ChatEvent, actorMe: boolean, actor: string, target: string, targetMe: boolean): string {
  switch (event.value) {
    case 'admin':
      if (targetMe) return T.youWereAssigned;
      return actorMe ? fmt(T.youAssignedAdmin, target) : fmt(T.assignedAdmin, actor, target);
    case 'readonly':
      if (targetMe) return fmt(T.bannedYou, actor);
      return actorMe ? fmt(T.youBanned, target) : fmt(T.banned, actor, target);
    default:
      // "member": the contract does not say which role the member had; revoking admin is assumed.
      if (targetMe) return T.youNoLongerAdmin;
      return actorMe ? fmt(T.youRevoked, target) : fmt(T.revoked, actor, target);
  }
}

/** The text of a service message as the viewer reads it. */
export function chatEventText(event: ChatEvent, names: EventNames): string {
  const actorMe = event.actor === names.me;
  const targetMe = event.target !== null && event.target === names.me;
  const actor = names.name(event.actor);
  const target = event.target === null ? '' : targetMe ? T.you : names.name(event.target);
  const value = event.value ?? '';
  switch (event.type) {
    case 'created':
      return actorMe ? fmt(T.youCreated, value) : fmt(T.created, actor, value);
    case 'joined_by_link':
      return actorMe ? fmt(T.joined, DOOR) : fmt(T.hasJoined, DOOR, actor);
    case 'member_added':
      if (event.target === event.actor) return actorMe ? fmt(T.joined, DOOR) : fmt(T.hasJoined, DOOR, actor);
      return actorMe ? fmt(T.added, WAVING_HAND, target) : fmt(T.hasAdded, WAVING_HAND, actor, target);
    case 'member_removed':
      if (targetMe) return fmt(T.removedYou, CROSS_MARK, actor);
      return actorMe ? fmt(T.youRemoved, CROSS_MARK, target) : fmt(T.removed, CROSS_MARK, actor, target);
    case 'member_left':
      return actorMe ? fmt(T.youLeft, MAN_WALKING) : fmt(T.hasLeft, MAN_WALKING, actor);
    case 'role_changed':
      return roleText(event, actorMe, actor, target, targetMe);
    case 'renamed':
      return actorMe ? fmt(T.youRenamed, value) : fmt(T.renamed, actor, value);
    case 'about_changed':
      if (value === '') return actorMe ? T.youDeletedAbout : fmt(T.deletedAbout, actor);
      return actorMe ? fmt(T.youChangedAbout, value) : fmt(T.changedAbout, actor, value);
    case 'rules_changed':
      if (value === '') return actorMe ? T.youDeletedRules : fmt(T.deletedRules, actor);
      return actorMe ? fmt(T.youChangedRules, value) : fmt(T.changedRules, actor, value);
    case 'avatar_changed':
      return actorMe ? T.youChangedAvatar : fmt(T.changedAvatar, actor);
    case 'link_changed':
      return (actorMe ? fmt(T.youChangedLink, value) : fmt(T.changedLink, actor, value)).trim();
    case 'approval_changed':
      if (isOn(event.value)) return actorMe ? T.youEnabledApproval : fmt(T.enabledApproval, actor);
      return actorMe ? T.youDisabledApproval : fmt(T.disabledApproval, actor);
  }
}
