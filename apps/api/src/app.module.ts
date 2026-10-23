import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { ApiExceptionFilter } from "./common/errors";
import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./database/database.module";
import { AppSyncModule } from "./modules/app-sync/app-sync.module";
import { AuditModule } from "./modules/audit/audit.module";
import { CitizenUpdatesModule } from "./modules/citizen-updates/citizen-updates.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthController } from "./modules/health/health.controller";
import { OffencesModule } from "./modules/offences/offences.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { StationsModule } from "./modules/stations/stations.module";
import { UsersModule } from "./modules/users/users.module";

const isTest = process.env.NODE_ENV === "test";
const isDev = process.env.NODE_ENV === "development";

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: isTest ? "silent" : isDev ? "debug" : "info",
        // Never log credentials, tokens or cookies.
        redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
        ...(isDev ? { transport: { target: "pino-pretty", options: { singleLine: true } } } : {}),
      },
    }),
    // 300 requests per minute per IP overall; sign-in routes are stricter.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: isTest ? 10_000 : 300 }]),
    DatabaseModule,
    AuditModule,
    CitizenUpdatesModule,
    AuthModule,
    SettingsModule,
    OffencesModule,
    ReportsModule,
    AppSyncModule,
    StationsModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [
    // Runs before the AccessGuard registered by AuthModule.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
