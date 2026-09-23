import { Type } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsString, IsUrl, Matches, MaxLength, ValidateNested } from 'class-validator';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+=*$/;

export class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(BASE64URL_PATTERN)
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(BASE64URL_PATTERN)
  auth: string;
}

export class SavePushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @MaxLength(2048)
  endpoint: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}
