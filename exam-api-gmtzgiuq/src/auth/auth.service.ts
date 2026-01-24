import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { RegisterInput, AuthPayload } from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return null;
    }

    const isPasswordValid = await this.usersService.validatePassword(user, password);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async login(user: User): Promise<AuthPayload> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      user,
    };
  }

  async register(registerInput: RegisterInput): Promise<AuthPayload> {
    const user = await this.usersService.create(
      registerInput.email,
      registerInput.password,
    );

    if (registerInput.firstName || registerInput.lastName) {
      await this.usersService.updateProfile(user.id, {
        firstName: registerInput.firstName,
        lastName: registerInput.lastName,
      });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    await this.usersService.setEmailVerificationToken(user.id, verificationToken);

    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      user,
    };
  }

  async verifyEmail(token: string): Promise<User> {
    return this.usersService.verifyEmail(token);
  }

  async requestPasswordReset(email: string): Promise<string> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // For security, don't reveal if email exists
      return 'If email exists, reset link will be sent';
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    await this.usersService.setResetPasswordToken(user.id, resetToken);

    return resetToken;
  }

  async resetPassword(token: string, newPassword: string): Promise<User> {
    return this.usersService.resetPassword(token, newPassword);
  }

  generateVerificationToken(user: User): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
