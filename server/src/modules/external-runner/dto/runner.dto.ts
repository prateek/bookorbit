import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SaveRunnerDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsString() @MinLength(1) @MaxLength(2048) baseUrl!: string;
  @IsOptional() @IsString() @MinLength(16) @MaxLength(4096) @Matches(/^[\x21-\x7e]+$/) token?: string;
  @IsBoolean() allowPrivateAddress!: boolean;
  @IsBoolean() enabled!: boolean;
}

export class RunnerPageDto {
  @IsOptional() @IsString() @MaxLength(512) @Matches(/^[a-zA-Z0-9_.:-]+$/) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

export class StartRunnerDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{1,100}$/) jobId!: string;
  @IsUUID() idempotencyKey!: string;
}

export class CancelRunnerDto {
  @IsUUID() idempotencyKey!: string;
}
