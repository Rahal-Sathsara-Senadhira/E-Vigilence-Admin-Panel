// Entry point: starts the app, nothing else (docs/18 §10).

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Providers } from "./app/providers.jsx";
import { AppRoutes } from "./app/router.jsx";
import "./styles/global.css";

createRoot(/** @type {HTMLElement} */ (document.getElementById("root"))).render(
  <StrictMode>
    <Providers>
      <AppRoutes />
    </Providers>
  </StrictMode>,
);
