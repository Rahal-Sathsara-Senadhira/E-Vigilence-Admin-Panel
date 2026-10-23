// Choosing the station — docs/03 §5.1 (built in the old system, rules kept):
// 1. an active station whose drawn jurisdiction contains the case location —
//    the smallest area wins, and overlaps are flagged;
// 2. otherwise the nearest active station;
// 3. warnings: overlapping jurisdictions, unverified station, no active officers.

import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import type { DispatchMethod } from "@ev/shared";
import { Types, type ClientSession, type Connection, type Model } from "mongoose";
import { Station } from "../stations/station.schema";

export interface StationChoice {
  stationId: Types.ObjectId;
  stationName: string;
  method: DispatchMethod;
  distanceKm: number | null;
  flags: string[];
}

type LeanStation = Station & { _id: Types.ObjectId };

@Injectable()
export class Dispatcher {
  constructor(
    @InjectModel(Station.name) private readonly stations: Model<Station>,
    @InjectConnection() private readonly conn: Connection,
  ) {}

  /** The automatic choice, skipping stations that already returned the case. */
  async choose(
    point: { lng: number; lat: number },
    exclude: Types.ObjectId[] = [],
  ): Promise<StationChoice | null> {
    const geo = { type: "Point" as const, coordinates: [point.lng, point.lat] as [number, number] };
    const covering = await this.stations
      .find({
        isActive: true,
        _id: { $nin: exclude },
        jurisdiction: { $geoIntersects: { $geometry: geo } },
      })
      .sort({ jurisdictionAreaKm2: 1 })
      .limit(5)
      .lean<LeanStation[]>();

    if (covering.length > 0) {
      const chosen = covering[0]!;
      const flags = covering.length > 1 ? ["overlapping_jurisdictions"] : [];
      return this.describe(chosen, "jurisdiction", await this.distanceTo(chosen._id, point), flags);
    }

    const [nearest] = await this.stations.aggregate<LeanStation & { distance: number }>([
      {
        $geoNear: {
          key: "location",
          near: geo,
          distanceField: "distance",
          spherical: true,
          query: { isActive: true, _id: { $nin: exclude } },
        },
      },
      { $limit: 1 },
    ]);
    if (!nearest) return null;
    return this.describe(nearest, "nearest", round(nearest.distance / 1000), []);
  }

  /** A station HQ chose by hand (method "manual") or the recording station ("station"). */
  async named(
    stationId: Types.ObjectId,
    point: { lng: number; lat: number },
    method: DispatchMethod,
    session?: ClientSession,
  ): Promise<StationChoice | null> {
    const s = await this.stations
      .findOne({ _id: stationId, isActive: true }, null, { session })
      .lean<LeanStation>();
    if (!s) return null;
    return this.describe(s, method, await this.distanceTo(s._id, point), [], session);
  }

  private async describe(
    s: LeanStation,
    method: DispatchMethod,
    distanceKm: number | null,
    flags: string[],
    session?: ClientSession,
  ): Promise<StationChoice> {
    const all = [...flags];
    if (!s.verified) all.push("unverified_station");
    const officers = await this.conn.collection("users").countDocuments(
      {
        staff: true,
        active: true,
        stationId: s._id,
        role: { $in: ["station_officer", "station_oic"] },
      },
      { limit: 1, session },
    );
    if (officers === 0) all.push("no_active_officers");
    return { stationId: s._id, stationName: s.name, method, distanceKm, flags: all };
  }

  private async distanceTo(stationId: Types.ObjectId, point: { lng: number; lat: number }) {
    const [row] = await this.stations.aggregate<{ distance: number }>([
      {
        $geoNear: {
          key: "location",
          near: { type: "Point" as const, coordinates: [point.lng, point.lat] as [number, number] },
          distanceField: "distance",
          spherical: true,
          query: { _id: stationId },
        },
      },
      { $limit: 1 },
    ]);
    return row ? round(row.distance / 1000) : null;
  }
}

function round(km: number) {
  return Math.round(km * 10) / 10;
}
