import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RemovePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  endpoint: string;
}
