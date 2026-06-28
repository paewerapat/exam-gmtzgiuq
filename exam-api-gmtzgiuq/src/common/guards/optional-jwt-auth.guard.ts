import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Attach req.user when a valid token is present, but never block the request
  handleRequest(err: any, user: any) {
    return user || null;
  }
}
