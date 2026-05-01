import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

import { AppConfig } from '../../common/config/app.config';
import { ExternalIdentity } from '../auth.types';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService<AppConfig, true>) {
    super({
      clientID: config.get('google.clientId', { infer: true }),
      clientSecret: config.get('google.clientSecret', { infer: true }),
      callbackURL: config.get('google.callbackUrl', { infer: true }),
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      done(new Error('Google profile did not include an email address.'));
      return;
    }

    const identity: ExternalIdentity = {
      provider: 'google',
      providerUserId: profile.id,
      email,
      displayName: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value,
    };

    done(null, identity);
  }
}
