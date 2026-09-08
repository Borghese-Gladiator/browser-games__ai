import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@portal/shared/theme.css";
import "@portal/shared/tiles.css";
import "./history.css";
import { HistoryApp } from "./HistoryApp.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HistoryApp />
  </StrictMode>,
);
