import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ENV, type Env } from "../../config/env";
import { EvidenceController } from "./evidence.controller";
import {
  CustodyEvent,
  CustodyEventSchema,
  EvidenceItem,
  EvidenceItemSchema,
} from "./evidence.schema";
import { EvidenceService } from "./evidence.service";
import { EVIDENCE_STORAGE, createEvidenceStorage } from "./storage";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EvidenceItem.name, schema: EvidenceItemSchema },
      { name: CustodyEvent.name, schema: CustodyEventSchema },
    ]),
  ],
  controllers: [EvidenceController],
  providers: [
    EvidenceService,
    {
      provide: EVIDENCE_STORAGE,
      inject: [ENV],
      useFactory: (env: Env) => createEvidenceStorage(env),
    },
  ],
  exports: [EvidenceService],
})
export class EvidenceModule {}
