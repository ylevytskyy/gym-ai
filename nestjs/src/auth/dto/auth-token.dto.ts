export class AuthTokenDto {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
}
