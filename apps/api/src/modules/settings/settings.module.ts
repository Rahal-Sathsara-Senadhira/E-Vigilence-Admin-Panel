import { Global, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SettingVersion, SettingVersionSchema } from "./setting-version.schema";
import { SettingsController } from "./settings.controller";
import { TimeLimitsService } from "./time-limits.service";

// Global: every later module asks TimeLimitsService for its deadlines.
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: SettingVersion.name, schema: SettingVersionSchema }]),
  ],
  controllers: [SettingsController],
  providers: [TimeLimitsService],
  exports: [TimeLimitsService],
})
export class SettingsModule {}
