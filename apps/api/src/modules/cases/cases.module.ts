import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { EvidenceModule } from "../evidence/evidence.module";
import { NoticesModule } from "../notices/notices.module";
import { PeopleModule } from "../people/people.module";
import { StationsModule } from "../stations/stations.module";
import { CaseQueryService } from "./case-query.service";
import { CaseWorkflowService } from "./case-workflow.service";
import { Case, CaseSchema } from "./case.schema";
import { CasesController } from "./cases.controller";
import { CasesService } from "./cases.service";
import { Dispatcher } from "./dispatcher";

@Module({
  imports: [
    StationsModule,
    PeopleModule,
    EvidenceModule,
    NoticesModule,
    MongooseModule.forFeature([{ name: Case.name, schema: CaseSchema }]),
  ],
  controllers: [CasesController],
  providers: [CasesService, CaseWorkflowService, CaseQueryService, Dispatcher],
  exports: [CasesService, CaseWorkflowService, MongooseModule],
})
export class CasesModule {}
