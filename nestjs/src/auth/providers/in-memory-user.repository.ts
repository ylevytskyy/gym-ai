import { Injectable } from '@nestjs/common';

import {
  AuthenticatedUser,
  ExternalIdentity,
  UserRepository,
} from '../auth.types';

@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, AuthenticatedUser>();
  private readonly identities = new Map<string, string>();

  upsertExternalIdentity(
    identity: ExternalIdentity,
  ): Promise<AuthenticatedUser> {
    const identityKey = `${identity.provider}:${identity.providerUserId}`;
    const existingUserId = this.identities.get(identityKey);

    if (existingUserId) {
      const existing = this.users.get(existingUserId);
      if (existing) {
        return Promise.resolve(existing);
      }
    }

    const user: AuthenticatedUser = {
      id: crypto.randomUUID(),
      email: identity.email,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      providers: [identity],
    };

    this.users.set(user.id, user);
    this.identities.set(identityKey, user.id);

    return Promise.resolve(user);
  }

  findById(id: string): Promise<AuthenticatedUser | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }
}
