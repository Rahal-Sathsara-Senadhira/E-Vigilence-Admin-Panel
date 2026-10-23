import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { systemContext } from "../common/context";
import { AuditService } from "../modules/audit/audit.service";
import type { Migration, MigrationResult } from "./migration";
import { MIGRATIONS } from "./registry";

interface AppliedRecord {
  _id: string;
  description: string;
  appliedAt: Date;
  durationMs: number;
  result: MigrationResult;
}

export interface MigrationRun {
  id: string;
  description: string;
  status: "applied" | "would_apply" | "already_applied" | "failed";
  result?: MigrationResult;
  error?: string;
  log: string[];
}

@Injectable()
export class MigrationsService {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    private readonly audit: AuditService,
  ) {}

  private get records() {
    return this.conn.collection<AppliedRecord>("migrations");
  }

  /**
   * Runs pending migrations in order. Dry run unless `apply` is true. Stops
   * at the first failure, so later steps never run on half-migrated data (R4).
   */
  async run(opts: { apply: boolean; migrations?: readonly Migration[] }): Promise<MigrationRun[]> {
    const list = opts.migrations ?? MIGRATIONS;
    const applied = new Set(
      (await this.records.find({}, { projection: { _id: 1 } }).toArray()).map((r) => r._id),
    );
    const runs: MigrationRun[] = [];

    for (const m of list) {
      const log: string[] = [];
      if (applied.has(m.id) && !m.repeatable) {
        runs.push({ id: m.id, description: m.description, status: "already_applied", log });
        continue;
      }
      const started = Date.now();
      try {
        const result = await m.run({
          conn: this.conn,
          apply: opts.apply,
          log: (line) => log.push(line),
        });
        if (opts.apply) {
          await this.records.replaceOne(
            { _id: m.id },
            {
              description: m.description,
              appliedAt: new Date(),
              durationMs: Date.now() - started,
              result,
            },
            { upsert: true },
          );
          await this.audit.record(systemContext("migrate"), {
            action: "system.migration_applied",
            summary: `Migration ${m.id} applied (${result.changed} change${result.changed === 1 ? "" : "s"})`,
            target: { type: "migration", id: m.id, label: m.description },
          });
        }
        runs.push({
          id: m.id,
          description: m.description,
          status: opts.apply ? "applied" : "would_apply",
          result,
          log,
        });
      } catch (err) {
        runs.push({
          id: m.id,
          description: m.description,
          status: "failed",
          error: (err as Error).message,
          log,
        });
        if (opts.apply) {
          await this.audit.record(systemContext("migrate"), {
            action: "system.migration_failed",
            summary: `Migration ${m.id} failed: ${(err as Error).message}`.slice(0, 500),
            target: { type: "migration", id: m.id, label: m.description },
          });
        }
        break;
      }
    }
    return runs;
  }
}
