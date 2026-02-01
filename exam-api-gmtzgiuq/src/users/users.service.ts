import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
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
      throw new ConflictException('Email already exists');
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
}
