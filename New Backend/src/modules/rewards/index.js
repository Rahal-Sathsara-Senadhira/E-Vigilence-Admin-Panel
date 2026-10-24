// What other modules may use from rewards (docs/19 §4.2 rule 2).
// Importing it also starts the rules that move points (events.js).

import "./events.js";

export { rewardsRoutes } from "./rewards.routes.js";
export { runRewardSweep } from "./rewards.service.js";
