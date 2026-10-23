import { Controller, Get, HttpException } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { AuditService } from "../audit/audit.service";
import { Public, RequirePermission } from "../auth/auth.decorators";

@Controller()
export class HealthController {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    private readonly audit: AuditService,
  ) {}

  /** For load balancers and uptime checks. Says nothing about the data. */
  @Get("health")
  @Public()
  async health() {
    const db = this.conn.readyState === 1 ? await this.ping() : false;
    if (!db) throw new HttpException({ status: "down", db: "down" }, 503);
    return { status: "ok", db: "up" };
  }

  /** System health page for dev — docs/12 §4.5. Phase 5 adds jobs and queues. */
  @Get("system/health")
  @RequirePermission("system.health")
  system() {
    return {
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      database: {
        state: this.conn.readyState === 1 ? "connected" : "disconnected",
        name: this.conn.name,
      },
      auditChain: this.audit.lastChainStatus,
    };
  }

  private async ping() {
    try {
      await this.conn.db?.admin().ping();
      return true;
    } catch {
      return false;
    }
  }
}
