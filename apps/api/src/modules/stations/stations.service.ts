import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, type ClientSession, type QueryFilter, type Model } from "mongoose";
import type { ActionContext } from "../../common/context";
import { Division, Station } from "./station.schema";

export interface StationView {
  id: string;
  name: string;
  divisionId: string | null;
  divisionName: string | null;
  isActive: boolean;
  verified: boolean;
}

@Injectable()
export class StationsService {
  constructor(
    @InjectModel(Station.name) private readonly stations: Model<Station>,
    @InjectModel(Division.name) private readonly divisions: Model<Division>,
  ) {}

  async findActive(id: string, session?: ClientSession) {
    if (!isValidObjectId(id)) return null;
    return this.stations.findOne({ _id: id, isActive: true }, null, { session }).lean();
  }

  async nameOf(id: string | null): Promise<string | null> {
    if (!id || !isValidObjectId(id)) return null;
    const s = await this.stations.findById(id, { name: 1 }).lean();
    return s?.name ?? null;
  }

  async namesByIds(ids: string[]): Promise<Map<string, string>> {
    const valid = [...new Set(ids.filter((id) => isValidObjectId(id)))];
    if (valid.length === 0) return new Map();
    const rows = await this.stations.find({ _id: { $in: valid } }, { name: 1 }).lean();
    return new Map(rows.map((r) => [String(r._id), r.name]));
  }

  async list(ctx: ActionContext, opts: { q?: string; divisionId?: string; activeOnly?: boolean }) {
    const filter: QueryFilter<Station> = {};
    if (ctx.scope === "station") filter._id = ctx.user?.stationId ?? null;
    if (opts.activeOnly !== false) filter.isActive = true;
    if (opts.divisionId && isValidObjectId(opts.divisionId)) filter.divisionId = opts.divisionId;
    if (opts.q) filter.name = { $regex: escapeRegex(opts.q), $options: "i" };

    const [rows, divisions] = await Promise.all([
      this.stations
        .find(filter, { name: 1, divisionId: 1, isActive: 1, verified: 1 }, { sort: { name: 1 } })
        .lean(),
      this.divisions.find({}, { name: 1 }).lean(),
    ]);
    const divisionNames = new Map(divisions.map((d) => [String(d._id), d.name]));

    return rows.map((s): StationView => ({
      id: String(s._id),
      name: s.name,
      divisionId: s.divisionId ? String(s.divisionId) : null,
      divisionName: s.divisionId ? (divisionNames.get(String(s.divisionId)) ?? null) : null,
      isActive: s.isActive,
      verified: s.verified,
    }));
  }

  listDivisions() {
    return this.divisions
      .find(
        { isActive: true },
        { name: 1, range: 1, province: 1 },
        { sort: { province: 1, name: 1 } },
      )
      .lean()
      .then((rows) =>
        rows.map((d) => ({
          id: String(d._id),
          name: d.name,
          range: d.range,
          province: d.province,
        })),
      );
  }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
