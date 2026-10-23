// Fields this backend adds to Express requests. Read by the type checker only.

import type { Types } from "mongoose";
import type { Role } from "./core/access/roles.js";
import type { Scope } from "./core/access/permissions.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by the authenticate middleware when a valid access token is sent. */
      auth?: {
        userId: Types.ObjectId;
        sessionId: Types.ObjectId;
        role: Role;
        name: string;
        stationId: Types.ObjectId | null;
        divisionId: Types.ObjectId | null;
      };
      /** Set by requirePermission: how far the permission reaches. */
      scope?: Scope;
      /** Set by the query validator. */
      validQuery?: any;
    }
  }
}

export {};
