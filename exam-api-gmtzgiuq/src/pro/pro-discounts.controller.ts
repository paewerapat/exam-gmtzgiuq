import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ProDiscountsService } from './pro-discounts.service';
import {
  CreateDiscountCodeDto,
  UpdateDiscountCodeDto,
} from './dto/pro-discounts.dto';

/**
 * Discount codes of the Pro checkout, admin only (task 19). Errors:
 * `{ statusCode, message (Thai), errorCode }`; DTO failures get the
 * ValidationPipe's 400. All under the fixed path admin/discount-codes.
 */
@Controller('pro/admin/discount-codes')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ProDiscountsController {
  constructor(private discountsService: ProDiscountsService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.discountsService.listForAdmin({
      page: page === undefined ? undefined : Number(page),
      limit: limit === undefined ? undefined : Number(limit),
      search: typeof search === 'string' ? search : undefined,
      isActive: typeof isActive === 'string' ? isActive : undefined,
    });
  }

  @Post()
  async create(@Body() body: CreateDiscountCodeDto, @CurrentUser() user: User) {
    return this.discountsService.create(body, user);
  }

  @Get(':id/redemptions')
  async redemptions(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.discountsService.listRedemptions(
      id,
      page === undefined ? undefined : Number(page),
      limit === undefined ? undefined : Number(limit),
    );
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.discountsService.getForAdmin(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateDiscountCodeDto) {
    return this.discountsService.update(id, body);
  }
}
