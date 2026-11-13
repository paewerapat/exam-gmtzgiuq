import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ProConfigService } from './pro-config.service';
import { ProSubscriptionsService } from './pro-subscriptions.service';
import {
  CreateProPlanDto,
  CreateProVenueDto,
  GrantProSubscriptionDto,
  RevokeProSubscriptionDto,
  UpdateProPageDto,
  UpdateProPlanDto,
  UpdateProVenueDto,
} from './dto/pro.dto';

/**
 * Pro membership (task 17). Errors of the services:
 * `{ statusCode, message (Thai), errorCode }`; a body that fails the DTO
 * gets the ValidationPipe's 400 (message = array of Thai messages).
 * Only fixed paths, no top-level `:id`.
 */
@Controller('pro')
export class ProController {
  constructor(
    private configService: ProConfigService,
    private subscriptionsService: ProSubscriptionsService,
  ) {}

  // Public - the Upgrade page; `my` only when logged in
  @Get('upgrade')
  @UseGuards(OptionalJwtAuthGuard)
  async upgrade(@CurrentUser() user: User | null) {
    return this.configService.getUpgrade(user);
  }

  // User - own subscriptions that give rights now
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: User) {
    return this.subscriptionsService.findMine(user.id);
  }

  // Admin - everything of the Upgrade page (entitlements included)
  @Get('admin/config')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminConfig() {
    return this.configService.getAdminConfig();
  }

  @Put('admin/page')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updatePage(@Body() body: UpdateProPageDto) {
    return this.configService.updatePage(body);
  }

  // Admin - venues
  @Post('admin/venues')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createVenue(@Body() body: CreateProVenueDto) {
    return this.configService.createVenue(body);
  }

  @Put('admin/venues/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateVenue(@Param('id') id: string, @Body() body: UpdateProVenueDto) {
    return this.configService.updateVenue(id, body);
  }

  @Delete('admin/venues/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deleteVenue(@Param('id') id: string) {
    return this.configService.deleteVenue(id);
  }

  // Admin - plans
  @Post('admin/plans')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createPlan(@Body() body: CreateProPlanDto) {
    return this.configService.createPlan(body);
  }

  @Put('admin/plans/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updatePlan(@Param('id') id: string, @Body() body: UpdateProPlanDto) {
    return this.configService.updatePlan(id, body);
  }

  @Delete('admin/plans/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deletePlan(@Param('id') id: string) {
    return this.configService.deletePlan(id);
  }

  // Admin - members
  @Get('admin/subscriptions')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async listSubscriptions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('venueId') venueId?: string,
    @Query('planId') planId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.subscriptionsService.listForAdmin({
      page: page === undefined ? undefined : Number(page),
      limit: limit === undefined ? undefined : Number(limit),
      venueId: typeof venueId === 'string' ? venueId : undefined,
      planId: typeof planId === 'string' ? planId : undefined,
      status: typeof status === 'string' ? status : undefined,
      search: typeof search === 'string' ? search : undefined,
    });
  }

  @Post('admin/subscriptions')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async grant(
    @Body() body: GrantProSubscriptionDto,
    @CurrentUser() user: User,
  ) {
    return this.subscriptionsService.grant(body, user);
  }

  @Post('admin/subscriptions/:id/revoke')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, AdminGuard)
  async revoke(
    @Param('id') id: string,
    @Body() body: RevokeProSubscriptionDto,
    @CurrentUser() user: User,
  ) {
    return this.subscriptionsService.revoke(id, body, user);
  }
}
