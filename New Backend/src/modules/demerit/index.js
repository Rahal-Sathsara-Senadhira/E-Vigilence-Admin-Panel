// What other modules may use from demerit points (docs/19 §4.2 rule 2).
// Importing it also starts the rules that record points (events.js).

import "./events.js";

export { demeritRoutes } from "./demerit.routes.js";
export { runDemeritSweep } from "./demerit.service.js";
