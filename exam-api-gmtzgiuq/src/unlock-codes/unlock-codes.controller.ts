import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { UnlockCodesService } from './unlock-codes.service';
import {
  CreateUnlockBatchDto,
  RedeemCodeDto,
  UpdateUnlockBatchDto,
  UpdateUnlockCodeDto,
} from './dto/unlock-code.dto';
import { csvContentDisposition } from './unlock-code-format';

/** Unlock codes (task 15). Admin routes are fixed paths under admin/. */
@Controller('unlock-codes')
export class UnlockCodesController {
  constructor(private unlockCodesService: UnlockCodesService) {}

  // User - redeem a code on an exam page → access to its campaign's exams.
  // Errors: { statusCode, message (Thai), errorCode }
  @Post('redeem')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async redeem(@Body() body: RedeemCodeDto, @CurrentUser() user: User) {
    return this.unlockCodesService.redeem(user, body);
  }

  // Admin - campaigns
  @Get('admin/batches')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async listBatches(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search?: string,
  ) {
    return this.unlockCodesService.listBatches(+page, +limit, search);
  }

  @Post('admin/batches')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createBatch(
    @Body() body: CreateUnlockBatchDto,
    @CurrentUser() user: User,
  ) {
    return this.unlockCodesService.createBatch(body, user);
  }

  // CSV of every code of a campaign (UTF-8 with BOM for Excel)
  @Get('admin/batches/:id/codes.csv')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async exportCsv(@Param('id') id: string) {
    const { name, csv } = await this.unlockCodesService.exportCsv(id);
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv; charset=utf-8',
      disposition: csvContentDisposition(name),
    });
  }

  @Get('admin/batches/:id/codes')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async listCodes(
    @Param('id') id: string,
    @Query('status') status: string = 'all',
    @Query('search') search?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
  ) {
    return this.unlockCodesService.listCodes(id, status, search, +page, +limit);
  }

  @Get('admin/batches/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getBatch(@Param('id') id: string) {
    return this.unlockCodesService.getBatch(id);
  }

  @Patch('admin/batches/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateBatch(
    @Param('id') id: string,
    @Body() body: UpdateUnlockBatchDto,
  ) {
    return this.unlockCodesService.updateBatch(id, body);
  }

  // Admin - turn one code on/off (a leaked code)
  @Patch('admin/codes/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateCode(@Param('id') id: string, @Body() body: UpdateUnlockCodeDto) {
    return this.unlockCodesService.updateCode(id, body.isActive);
  }
}
