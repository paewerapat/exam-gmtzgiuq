import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ProPaymentsService } from './pro-payments.service';
import {
  ChangeCardDto,
  CheckoutDto,
  CheckoutQuoteQueryDto,
  OmiseWebhookDto,
} from './dto/pro-payments.dto';

/**
 * Pro payments with Opn (task 18). Errors: `{ statusCode, message (Thai),
 * errorCode }`; DTO failures get the ValidationPipe's 400. Fixed paths
 * (`checkout/...`, `payments/me`, `payments/omise/webhook`, `admin/...`)
 * come before `payments/:id`.
 */
@Controller('pro')
export class ProPaymentsController {
  constructor(private paymentsService: ProPaymentsService) {}

  @Get('checkout/quote')
  @UseGuards(JwtAuthGuard)
  async quote(
    @Query() query: CheckoutQuoteQueryDto,
    @CurrentUser() user: User,
  ) {
    return this.paymentsService.quote(user.id, query.planId);
  }

  @Post('checkout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async checkout(@Body() body: CheckoutDto, @CurrentUser() user: User) {
    return this.paymentsService.checkout(user, body);
  }

  @Get('payments/me')
  @UseGuards(JwtAuthGuard)
  async myPayments(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentsService.listMine(
      user.id,
      page === undefined ? undefined : Number(page),
      limit === undefined ? undefined : Number(limit),
    );
  }

  // Public - Opn calls it; only the event id of the body is used; at most
  // 30 junk requests / minute / client IP (then 503), handled event ids
  // cached 10 min; real events are never limited
  @Post('payments/omise/webhook')
  @HttpCode(200)
  async webhook(@Body() body: OmiseWebhookDto, @Ip() ip: string) {
    return this.paymentsService.handleWebhook(body?.id, ip);
  }

  @Get('admin/payments')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async adminPayments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('method') method?: string,
    @Query('venueId') venueId?: string,
    @Query('search') search?: string,
  ) {
    return this.paymentsService.listForAdmin({
      page: page === undefined ? undefined : Number(page),
      limit: limit === undefined ? undefined : Number(limit),
      status: typeof status === 'string' ? status : undefined,
      method: typeof method === 'string' ? method : undefined,
      venueId: typeof venueId === 'string' ? venueId : undefined,
      search: typeof search === 'string' ? search : undefined,
    });
  }

  // Owner only (someone else's → 404)
  @Get('payments/:id')
  @UseGuards(JwtAuthGuard)
  async payment(@Param('id') id: string, @CurrentUser() user: User) {
    return this.paymentsService.getMine(user.id, id);
  }

  @Post('subscriptions/:id/cancel-renewal')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async cancelRenewal(@Param('id') id: string, @CurrentUser() user: User) {
    return this.paymentsService.cancelRenewal(user.id, id);
  }

  @Post('subscriptions/:id/change-card')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async changeCard(
    @Param('id') id: string,
    @Body() body: ChangeCardDto,
    @CurrentUser() user: User,
  ) {
    return this.paymentsService.changeCard(user, id, body.cardToken);
  }
}
