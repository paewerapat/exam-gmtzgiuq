import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFeedbackDto {
  @IsOptional()
  @IsUUID()
  examId?: string;

  @IsOptional()
  @IsInt()
  @Min(11)
  @Max(20)
  age?: number;

  @IsString()
  @MinLength(1)
  message: string;

  @IsOptional()
  @IsString()
  details?: string;
}
