import { Global, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  OffenceVersion,
  OffenceVersionSchema,
  PublicOffenceDoc,
  PublicOffenceSchema,
} from "./offence.schema";
import { OffencesController } from "./offences.controller";
import { OffencesService } from "./offences.service";

// Global: reports, cases and notices all check offences against the schedule.
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OffenceVersion.name, schema: OffenceVersionSchema },
      { name: PublicOffenceDoc.name, schema: PublicOffenceSchema },
    ]),
  ],
  controllers: [OffencesController],
  providers: [OffencesService],
  exports: [OffencesService],
})
export class OffencesModule {}
