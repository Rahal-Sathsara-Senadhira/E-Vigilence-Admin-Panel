import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

import "./index.css";                               // <-- Tailwind directives
import "leaflet/dist/leaflet.css";
import "./leaflet-fix";                             // if you have the marker fix
import "./leaflet-geoman-setup.js"; 
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
