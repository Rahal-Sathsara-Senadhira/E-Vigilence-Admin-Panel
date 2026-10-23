import { Global, Module } from "@nestjs/common";
import { ReportUpdatesService } from "./report-updates.service";

// What citizens see in the mobile app (docs/11 §5) — used by reports and cases.
@Global()
@Module({
  providers: [ReportUpdatesService],
  exports: [ReportUpdatesService],
})
export class CitizenUpdatesModule {}
