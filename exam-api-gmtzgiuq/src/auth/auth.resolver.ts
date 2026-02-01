import { Resolver, Mutation, Args, Query } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  RegisterInput,
  LoginInput,
  AuthPayload,
  ResetPasswordInput,
} from './dto/auth.dto';
import { User } from '../users/user.entity';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';

@Resolver()
export class AuthResolver {
  constructor(private authService: AuthService) {}

  @Mutation(() => AuthPayload)
  async register(
    @Args('input') registerInput: RegisterInput,
  ): Promise<AuthPayload> {
    return this.authService.register(registerInput);
  }

  @Mutation(() => AuthPayload)
  async login(
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<AuthPayload> {
    const user = await this.authService.validateUser(email, password);
    if (!user) {
      throw new Error('Invalid credentials');
    }
    return this.authService.login(user);
  }

  @Mutation(() => AuthPayload)
  async googleLogin(
    @Args('credential') credential: string,
  ): Promise<AuthPayload> {
    return this.authService.googleLogin(credential);
  }

  @Mutation(() => User)
  async verifyEmail(@Args('token') token: string): Promise<User> {
    return this.authService.verifyEmail(token);
  }

  @Mutation(() => String)
  async requestPasswordReset(@Args('email') email: string): Promise<string> {
    return this.authService.requestPasswordReset(email);
  }

  @Mutation(() => User)
  async resetPassword(
    @Args('input') resetPasswordInput: ResetPasswordInput,
  ): Promise<User> {
    return this.authService.resetPassword(
      resetPasswordInput.token,
      resetPasswordInput.newPassword,
    );
  }

  @Query(() => User)
  @UseGuards(GqlAuthGuard)
  async currentUser(@CurrentUser() user: User): Promise<User> {
    return user;
  }
}
