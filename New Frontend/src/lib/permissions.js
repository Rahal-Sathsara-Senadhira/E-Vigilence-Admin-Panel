// What the signed-in user may do. The backend sends every permission with
// its scope at sign-in (docs/19 D19-5); the panel only reads them. It hides
// what isn't allowed, and the backend refuses it anyway (docs/20 R6).

/** @typedef {import("./api.js").CurrentUser} CurrentUser */

/** @param {CurrentUser | null} user @param {string} permission */
export const can = (user, permission) => Boolean(user?.permissions[permission]);

/** @param {CurrentUser | null} user @param {string} permission */
export const scopeOf = (user, permission) => user?.permissions[permission] ?? null;
