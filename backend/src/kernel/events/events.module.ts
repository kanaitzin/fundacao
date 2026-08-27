import { Global, Module } from '@nestjs/common';
import { EventBus } from './event-bus.service';
import { TimelineRegistry } from './timeline-registry.service';

@Global()
@Module({
  providers: [EventBus, TimelineRegistry],
  exports: [EventBus, TimelineRegistry],
})
export class EventsModule {}
