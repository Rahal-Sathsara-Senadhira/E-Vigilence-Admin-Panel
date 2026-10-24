// What other modules may use from notifications (docs/19 §4.2 rule 2).
// Importing it also starts the event rules (events.js).

import "./events.js";

export { runDeadlineSweep } from "./deadlines.js";
export { notify } from "./notify.js";
export { notificationsRoutes, overdueRoutes } from "./notifications.routes.js";
