import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { UserRole } from '../../users/user.entity';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const contextType = context.getType<string>();

    let user;
    if (contextType === 'graphql') {
      const ctx = GqlExecutionContext.create(context);
      user = ctx.getContext().req?.user;
    } else {
      const request = context.switchToHttp().getRequest();
      user = request.user;
    }

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
