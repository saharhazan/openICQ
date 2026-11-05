/** "Find User" search, user details and away messages of other users. */
import {
  LIMITS,
  hasStatusMessage,
  type Profile,
  type ProfileUpdate,
  type SearchQuery,
  type SearchResult,
  type Status,
  type Uin,
} from '@openicq/protocol';
import type { UserRecord } from '../domain/entities.ts';
import type { UserRepository } from '../domain/repositories.ts';
import { profileFieldsOf, toProfile, visibleEmail } from './mappers.ts';
import { mergeDefined, requireUser } from './support.ts';
import type { VisibilityResolver } from './visibility-resolver.ts';

export interface DirectoryServiceDeps {
  readonly users: UserRepository;
  readonly visibility: VisibilityResolver;
}

export interface AwayInfo {
  readonly status: Status;
  readonly text: string;
}

export class DirectoryService {
  private readonly users: UserRepository;
  private readonly visibility: VisibilityResolver;

  constructor(deps: DirectoryServiceDeps) {
    this.users = deps.users;
    this.visibility = deps.visibility;
  }

  search(viewer: Uin, query: SearchQuery): SearchResult[] {
    return this.find(query).map((user) => this.toResult(user, viewer));
  }

  getProfile(viewer: Uin, uin: Uin): Profile {
    return toProfile(requireUser(this.users, uin), viewer);
  }

  updateProfile(uin: Uin, update: ProfileUpdate): Profile {
    const current = requireUser(this.users, uin);
    const updated = this.users.updateProfile(uin, mergeDefined(profileFieldsOf(current), update));
    return toProfile(updated, uin);
  }

  /** "Read Away Message": the text is empty unless the visible status carries a status message (FFC included). */
  getAway(viewer: Uin, uin: Uin): AwayInfo {
    const user = requireUser(this.users, uin);
    const status = this.visibility.statusFor(viewer, uin);
    return { status, text: hasStatusMessage(status) ? user.awayMessages[status] : '' };
  }

  private find(query: SearchQuery): UserRecord[] {
    switch (query.by) {
      case 'uin': {
        const user = this.users.findByUin(query.uin);
        return user === null ? [] : [user];
      }
      case 'email':
        return this.users.findByVisibleEmail(query.email, LIMITS.searchResults);
      case 'details':
        return this.users.searchByDetails(query, LIMITS.searchResults);
    }
  }

  private toResult(user: UserRecord, viewer: Uin): SearchResult {
    return {
      uin: user.uin,
      nickname: user.nickname,
      firstName: user.firstName,
      lastName: user.lastName,
      email: visibleEmail(user, viewer),
      authRequired: user.authRequired,
      online: user.webAware ? this.visibility.publicStatusFor(viewer, user.uin) !== 'offline' : null,
    };
  }
}
