// Runs before every build (npm "prebuild"). On Vercel it stops the deploy
// while vercel.json still forwards /api to the placeholder address: the panel
// would load, then every sign-in and request would fail (docs/22 §2).

import fs from "node:fs";

if (process.env.VERCEL) {
  const config = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const api = (config.rewrites ?? []).find((/** @type {any} */ r) => r.source.startsWith("/api"));
  if (!api || /REPLACE-WITH/.test(api.destination)) {
    console.error(
      "\nvercel.json still forwards /api to a placeholder. Put the backend's Railway address in\n" +
        'the "/api/:path*" rewrite (e.g. https://e-vigilance-api.up.railway.app/api/:path*),\n' +
        "commit it, and deploy again.\n",
    );
    process.exit(1);
  }
}
