import { InputType, Field, ObjectType, Int } from '@nestjs/graphql';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { Blog, BlogStatus, BlogCategory } from '../blog.entity';

@InputType()
export class CreateBlogInput {
  @Field()
  @IsString()
  title: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  slug?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  excerpt?: string;

  @Field()
  @IsString()
  content: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  featuredImage?: string;

  @Field(() => BlogStatus, { nullable: true })
  @IsEnum(BlogStatus)
  @IsOptional()
  status?: BlogStatus;

  @Field(() => BlogCategory, { nullable: true })
  @IsEnum(BlogCategory)
  @IsOptional()
  category?: BlogCategory;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  metaTitle?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  metaDescription?: string;
}

@InputType()
export class UpdateBlogInput {
  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  title?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  slug?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  excerpt?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  content?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  featuredImage?: string;

  @Field(() => BlogStatus, { nullable: true })
  @IsEnum(BlogStatus)
  @IsOptional()
  status?: BlogStatus;

  @Field(() => BlogCategory, { nullable: true })
  @IsEnum(BlogCategory)
  @IsOptional()
  category?: BlogCategory;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  metaTitle?: string;

  @Field({ nullable: true })
  @IsString()
  @IsOptional()
  metaDescription?: string;
}

@ObjectType()
export class PaginatedBlogs {
  @Field(() => [Blog])
  items: Blog[];

  @Field(() => Int)
  total: number;

  @Field(() => Int)
  page: number;

  @Field(() => Int)
  limit: number;

  @Field(() => Int)
  totalPages: number;
}
