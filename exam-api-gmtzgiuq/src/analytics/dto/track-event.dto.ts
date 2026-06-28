import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackEventDto {
  @IsString()
  @MaxLength(100)
  event: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}
