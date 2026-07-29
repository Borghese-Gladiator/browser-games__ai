import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@portal/shared/theme.css";
import "@browser-games/game-client/lobby.css";
import "@browser-games/game-client/chrome.css";
import "./president.css";
import { President } from "./President.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <President />
  </StrictMode>,
);
