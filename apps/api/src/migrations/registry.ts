// Every migration, in the order they run. Append only — never reorder,
// rename or remove one that has been applied anywhere.

import { createIndexes } from "./0001-create-indexes";
import { seedOffences } from "./0002-seed-offence-schedule";
import type { Migration } from "./migration";

export const MIGRATIONS: readonly Migration[] = [createIndexes, seedOffences];
