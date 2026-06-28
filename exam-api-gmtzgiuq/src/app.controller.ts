import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Lightweight server-time endpoint used by the frontend to detect/correct client clock drift
  @Get('time')
  getServerTime(): { now: number } {
    return { now: Date.now() };
  }
}
