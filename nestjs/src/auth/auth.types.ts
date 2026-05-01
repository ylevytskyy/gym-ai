export type AuthProvider = 'google' | 'apple' | 'email';

export interface ExternalIdentity {
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  providers: ExternalIdentity[];
}

export interface JwtUserPayload {
  sub: string;
  email: string;
}

export interface JwtUser extends JwtUserPayload {
  userId: string;
}

export interface UserRepository {
  upsertExternalIdentity(
    identity: ExternalIdentity,
  ): Promise<AuthenticatedUser>;
  findById(id: string): Promise<AuthenticatedUser | null>;
}
