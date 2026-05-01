import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

import { JwtUser } from './auth.types';

type RequestWithUser = FastifyRequest & {
  user?: JwtUser;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtUser | undefined => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
