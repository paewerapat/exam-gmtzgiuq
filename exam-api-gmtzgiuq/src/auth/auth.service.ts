import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { User } from '../users/user.entity';
import { RegisterInput, AuthPayload } from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    private configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
    );
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return null;
    }

    // Check if user registered with Google
    if (user.provider === 'google') {
      throw new ConflictException(
        'อีเมลนี้ลงทะเบียนด้วย Google กรุณาเข้าสู่ระบบด้วย Google',
      );
    }

    const isPasswordValid = await this.usersService.validatePassword(
      user,
      password,
    );
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

    // Generate verification token and send email
    const verificationToken = crypto.randomBytes(32).toString('hex');
    await this.usersService.setEmailVerificationToken(
      user.id,
      verificationToken,
    );

    // Send verification email asynchronously
    this.mailService
      .sendVerificationEmail(user.email, verificationToken)
      .catch((err) => {
        console.error('Failed to send verification email:', err);
      });

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

    // Send password reset email asynchronously
    this.mailService
      .sendPasswordResetEmail(user.email, resetToken)
      .catch((err) => {
        console.error('Failed to send password reset email:', err);
      });

    return resetToken;
  }

  async resetPassword(token: string, newPassword: string): Promise<User> {
    return this.usersService.resetPassword(token, newPassword);
  }

  generateVerificationToken(user: User): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async googleLogin(credential: string): Promise<AuthPayload> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new UnauthorizedException('Invalid Google token');
      }

      const user = await this.usersService.findOrCreateGoogleUser({
        email: payload.email,
        googleId: payload.sub,
        firstName: payload.given_name,
        lastName: payload.family_name,
        avatar: payload.picture,
      });

      const jwtPayload: JwtPayload = { sub: user.id, email: user.email };
      return {
        accessToken: this.jwtService.sign(jwtPayload),
        user,
      };
    } catch (error) {
      // Re-throw ConflictException to preserve the Thai error message
      if (error instanceof ConflictException) {
        throw error;
      }
      console.error('Google login error:', error);
      throw new UnauthorizedException('ไม่สามารถเข้าสู่ระบบด้วย Google ได้');
    }
  }
}
