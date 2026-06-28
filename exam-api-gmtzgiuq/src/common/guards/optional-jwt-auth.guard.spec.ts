import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  const guard = new OptionalJwtAuthGuard();

  it('returns the user when authentication succeeds', () => {
    const user = { id: 'user-1' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('returns null instead of throwing when there is no token or it is invalid', () => {
    expect(guard.handleRequest(null, false)).toBeNull();
    expect(guard.handleRequest(new Error('invalid'), false)).toBeNull();
  });
});
