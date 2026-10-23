import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CasesModule } from "../cases/cases.module";
import { EvidenceModule } from "../evidence/evidence.module";
import { StationsModule } from "../stations/stations.module";
import { IncidentReport, IncidentReportSchema } from "./report.schema";
import { ReporterRecord, ReporterRecordSchema } from "./reporter-record.schema";
import { ReportersController } from "./reporters.controller";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [
    CasesModule,
    EvidenceModule,
    StationsModule,
    MongooseModule.forFeature([
      { name: IncidentReport.name, schema: IncidentReportSchema },
      { name: ReporterRecord.name, schema: ReporterRecordSchema },
    ]),
  ],
  controllers: [ReportsController, ReportersController],
  providers: [ReportsService],
  exports: [ReportsService, MongooseModule],
})
export class ReportsModule {}
