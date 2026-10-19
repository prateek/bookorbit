import { Global, Module } from '@nestjs/common';

import { BookModule } from '../book/book.module';
import { NotificationModule } from '../notification/notification.module';
import { NewArrivalsController } from './new-arrivals.controller';
import { NewBooksPushNotifier } from './new-books-push.notifier';
import { PushController } from './push.controller';
import { PushRepository } from './push.repository';
import { PushService } from './push.service';

/** Global so the scanner and upload paths can report new books without importing this module. */
@Global()
@Module({
  imports: [BookModule, NotificationModule],
  controllers: [PushController, NewArrivalsController],
  providers: [PushRepository, PushService, NewBooksPushNotifier],
  exports: [NewBooksPushNotifier],
})
export class PushModule {}
