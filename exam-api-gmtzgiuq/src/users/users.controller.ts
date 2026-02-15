import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // Admin - Get all users
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('role') role?: string,
  ) {
    return this.usersService.findAll(+page, +limit, search, role);
  }

  // Admin - Get user stats
  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getStats() {
    return this.usersService.getUserStats();
  }

  // Admin - Get single user (safe fields only)
  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const { password, emailVerificationToken, emailVerificationExpires, resetPasswordToken, resetPasswordExpires, ...safeUser } = user;
    return safeUser;
  }
}
