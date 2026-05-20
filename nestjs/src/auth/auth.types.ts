export interface AuthenticatedUser {
  userId: string;
  email?: string;
  role: string;
  sessionId?: string;
  accessToken: string;
}
