import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * Provides the completion-email fan-out engine. Relies on the global PrismaModule and
 * MailModule (both registered app-wide), so no imports are needed here.
 */
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
