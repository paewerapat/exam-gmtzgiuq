import { User, UserRole, USER_PRIVATE_FIELDS } from './user.entity';
import { Exam } from '../exams/exam.entity';
import { ExamAttempt } from '../attempts/attempt.entity';

type SerializedUser = Record<string, unknown>;
interface Serialized {
  items: {
    user: SerializedUser;
    exam: { author: SerializedUser; questions: { author: SerializedUser }[] };
  }[];
  feedback: { user: SerializedUser }[];
}

function makeUser(): User {
  return Object.assign(new User(), {
    id: 'u1',
    email: 'student@example.com',
    password: '$2b$10$hashhashhash',
    firstName: 'Somchai',
    lastName: 'Jaidee',
    isEmailVerified: false,
    emailVerificationToken: 'verify-secret',
    emailVerificationExpires: new Date('2026-11-02T00:00:00Z'),
    resetPasswordToken: 'reset-secret',
    resetPasswordExpires: new Date('2026-11-02T00:00:00Z'),
    provider: 'google',
    providerId: 'google-sub-123',
    isActive: true,
    role: UserRole.ADMIN,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
}

function expectNoSecrets(json: string) {
  expect(json).not.toMatch(/password/i);
  expect(json).not.toMatch(/Token"/);
  expect(json).not.toMatch(/Expires"/);
  expect(json).not.toMatch(/providerId/);
  expect(json).not.toContain('verify-secret');
  expect(json).not.toContain('reset-secret');
  expect(json).not.toContain('hashhashhash');
  expect(json).not.toContain('google-sub-123');
}

describe('User serialization (SEC-2)', () => {
  it('strips every private field from JSON but keeps the fields the web uses', () => {
    const parsed = JSON.parse(JSON.stringify(makeUser())) as Record<
      string,
      unknown
    >;

    for (const key of USER_PRIVATE_FIELDS) {
      expect(parsed).not.toHaveProperty(key);
    }
    expect(parsed).toMatchObject({
      id: 'u1',
      email: 'student@example.com',
      firstName: 'Somchai',
      lastName: 'Jaidee',
      role: 'admin',
      provider: 'google',
      isEmailVerified: false,
      isActive: true,
    });
  });

  it('strips private fields from users nested in other entities (exam.author, attempt.user, attempt.exam.author)', () => {
    const exam = Object.assign(new Exam(), {
      id: 'e1',
      title: 'คณิต ม.4',
      author: makeUser(),
      questions: [{ id: 'q1', author: makeUser() }],
    });
    const attempt = Object.assign(new ExamAttempt(), {
      id: 'a1',
      user: makeUser(),
      exam,
    });
    const body = {
      user: makeUser(),
      items: [attempt],
      feedback: [{ id: 'f1', user: makeUser() }],
    };

    const json = JSON.stringify(body);

    expectNoSecrets(json);
    const parsed = JSON.parse(json) as Serialized;
    expect(parsed.items[0].user.email).toBe('student@example.com');
    expect(parsed.items[0].exam.author.firstName).toBe('Somchai');
    expect(parsed.items[0].exam.questions[0].author.role).toBe('admin');
    expect(parsed.feedback[0].user.email).toBe('student@example.com');
  });

  it('does not touch the entity itself (password stays readable for validatePassword)', () => {
    const user = makeUser();
    JSON.stringify(user);

    expect(user.password).toBe('$2b$10$hashhashhash');
    expect(user.resetPasswordToken).toBe('reset-secret');
    expect(user.providerId).toBe('google-sub-123');
  });
});
