import { Module } from "@nestjs/common";
import { EvidenceModule } from "../evidence/evidence.module";
import { ReportsModule } from "../reports/reports.module";
import { AppSyncService } from "./app-sync.service";

@Module({
  imports: [ReportsModule, EvidenceModule],
  providers: [AppSyncService],
  exports: [AppSyncService],
})
export class AppSyncModule {}
