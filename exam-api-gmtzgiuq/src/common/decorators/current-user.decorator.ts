import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { User } from '../../users/user.entity';

export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext): User | null => {
    // Check if it's GraphQL context by trying to create GqlExecutionContext
    const contextType = context.getType<string>();

    if (contextType === 'graphql') {
      const ctx = GqlExecutionContext.create(context);
      const user = ctx.getContext<{ req?: { user?: User } }>()?.req?.user;
      return user ?? null;
    }

    // REST context
    const request = context.switchToHttp().getRequest<{ user?: User }>();
    return request?.user ?? null;
  },
);
