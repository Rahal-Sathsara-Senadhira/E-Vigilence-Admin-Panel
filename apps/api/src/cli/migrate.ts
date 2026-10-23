// Runs database migrations — docs/14 §5.
//
//   pnpm migrate            dry run: lists what would change, writes nothing
//   pnpm migrate --apply    applies pending migrations (back up first — R3)

import "../load-env";
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { MigrationsModule } from "../migrations/migrations.module";
import { MigrationsService } from "../migrations/migrations.service";

@Module({ imports: [AppModule, MigrationsModule] })
class MigrateModule {}

async function main() {
  const apply = process.argv.includes("--apply");
  const app = await NestFactory.createApplicationContext(MigrateModule, {
    logger: ["error", "warn"],
  });
  try {
    console.log(
      apply ? "Applying migrations…" : "Dry run — nothing will be written. Use --apply to apply.",
    );
    const runs = await app.get(MigrationsService).run({ apply });
    for (const r of runs) {
      const label = {
        applied: "APPLIED  ",
        would_apply: "PENDING  ",
        already_applied: "done     ",
        failed: "FAILED   ",
      }[r.status];
      console.log(`${label}${r.id} — ${r.description}`);
      for (const line of r.log) console.log(`           ${line}`);
      if (r.result && r.status !== "already_applied")
        console.log(`           changes: ${r.result.changed}`);
      if (r.error) console.log(`           error: ${r.error}`);
    }
    if (runs.some((r) => r.status === "failed")) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
