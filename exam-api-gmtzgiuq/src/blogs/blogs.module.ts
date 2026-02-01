import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Blog } from './blog.entity';
import { BlogsService } from './blogs.service';
import { BlogsResolver } from './blogs.resolver';
import { BlogsController } from './blogs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Blog])],
  providers: [BlogsService, BlogsResolver],
  controllers: [BlogsController],
  exports: [BlogsService],
})
export class BlogsModule {}
