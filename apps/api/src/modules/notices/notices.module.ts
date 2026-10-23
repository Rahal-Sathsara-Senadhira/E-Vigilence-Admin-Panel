import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Case, CaseSchema } from "../cases/case.schema";
import { Person, PersonSchema } from "../people/people.schema";
import { StationsModule } from "../stations/stations.module";
import {
  OutboxMessage,
  OutboxMessageSchema,
  PenaltyNotice,
  PenaltyNoticeSchema,
} from "./notice.schema";
import { NoticesController } from "./notices.controller";
import { NoticesService } from "./notices.service";
import { OutboxService } from "./outbox.service";

@Module({
  imports: [
    StationsModule,
    MongooseModule.forFeature([
      { name: PenaltyNotice.name, schema: PenaltyNoticeSchema },
      { name: OutboxMessage.name, schema: OutboxMessageSchema },
      { name: Case.name, schema: CaseSchema },
      { name: Person.name, schema: PersonSchema },
    ]),
  ],
  controllers: [NoticesController],
  providers: [NoticesService, OutboxService],
  exports: [NoticesService, OutboxService],
})
export class NoticesModule {}
