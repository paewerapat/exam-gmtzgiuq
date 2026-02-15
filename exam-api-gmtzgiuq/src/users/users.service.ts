import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(email: string, password: string): Promise<User> {
    const existingUser = await this.usersRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      // Check if user registered with Google
      if (existingUser.provider === 'google') {
        throw new ConflictException(
          'อีเมลนี้ลงทะเบียนด้วย Google กรุณาเข้าสู่ระบบด้วย Google',
        );
      }
      throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.usersRepository.create({
      email,
      password: hashedPassword,
      provider: 'local',
    });

    return this.usersRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findByProviderId(
    provider: string,
    providerId: string,
  ): Promise<User | null> {
    return this.usersRepository.findOne({ where: { provider, providerId } });
  }

  async findOrCreateGoogleUser(googleData: {
    email: string;
    googleId: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  }): Promise<User> {
    // First try to find by Google provider ID
    let user = await this.findByProviderId('google', googleData.googleId);

    if (!user) {
      // Try to find by email
      user = await this.findByEmail(googleData.email);

      if (user) {
        // User exists with different provider - reject Google login
        if (user.provider === 'local') {
          throw new ConflictException(
            'อีเมลนี้ลงทะเบียนด้วยรหัสผ่าน กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน',
          );
        }
        // If somehow provider is something else, still reject
        throw new ConflictException(
          `อีเมลนี้ลงทะเบียนด้วยวิธีอื่น กรุณาเข้าสู่ระบบด้วยวิธีเดิม`,
        );
      }

      // Create new user with Google
      user = this.usersRepository.create({
        email: googleData.email,
        provider: 'google',
        providerId: googleData.googleId,
        firstName: googleData.firstName,
        lastName: googleData.lastName,
        avatar: googleData.avatar,
        isEmailVerified: true, // Google emails are verified
      });

      return this.usersRepository.save(user);
    }

    return user;
  }

  async updateProfile(
    userId: string,
    data: { firstName?: string; lastName?: string; avatar?: string },
  ): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    Object.assign(user, data);
    return this.usersRepository.save(user);
  }

  async updatePassword(userId: string, newPassword: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    return this.usersRepository.save(user);
  }

  async setEmailVerificationToken(
    userId: string,
    token: string,
  ): Promise<void> {
    const expires = new Date();
    expires.setHours(expires.getHours() + 24); // Token expires in 24 hours

    await this.usersRepository.update(userId, {
      emailVerificationToken: token,
      emailVerificationExpires: expires,
    });
  }

  async verifyEmail(token: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { emailVerificationToken: token },
    });

    if (!user || !user.emailVerificationExpires) {
      throw new NotFoundException('Invalid verification token');
    }

    if (new Date() > user.emailVerificationExpires) {
      throw new ConflictException('Verification token has expired');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;

    return this.usersRepository.save(user);
  }

  async setResetPasswordToken(userId: string, token: string): Promise<void> {
    const expires = new Date();
    expires.setHours(expires.getHours() + 1); // Token expires in 1 hour

    await this.usersRepository.update(userId, {
      resetPasswordToken: token,
      resetPasswordExpires: expires,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { resetPasswordToken: token },
    });

    if (!user || !user.resetPasswordExpires) {
      throw new NotFoundException('Invalid reset token');
    }

    if (new Date() > user.resetPasswordExpires) {
      throw new ConflictException('Reset token has expired');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    return this.usersRepository.save(user);
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    if (!user.password) return false;
    return bcrypt.compare(password, user.password);
  }

  // Admin methods
  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    role?: string,
  ): Promise<{
    items: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const qb = this.usersRepository.createQueryBuilder('user');

    // Only select safe fields (exclude password, tokens)
    qb.select([
      'user.id',
      'user.email',
      'user.firstName',
      'user.lastName',
      'user.avatar',
      'user.isEmailVerified',
      'user.provider',
      'user.isActive',
      'user.role',
      'user.createdAt',
      'user.updatedAt',
    ]);

    if (search) {
      qb.andWhere(
        '(user.email LIKE :search OR user.firstName LIKE :search OR user.lastName LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (role) {
      qb.andWhere('user.role = :role', { role });
    }

    qb.orderBy('user.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    adminUsers: number;
    googleUsers: number;
  }> {
    const total = await this.usersRepository.count();
    const active = await this.usersRepository.count({
      where: { isActive: true },
    });
    const admins = await this.usersRepository.count({
      where: { role: UserRole.ADMIN },
    });
    const google = await this.usersRepository.count({
      where: { provider: 'google' },
    });

    return {
      totalUsers: total,
      activeUsers: active,
      adminUsers: admins,
      googleUsers: google,
    };
  }
}
