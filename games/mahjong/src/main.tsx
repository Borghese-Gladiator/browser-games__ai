import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@portal/shared/theme.css";
import "@portal/shared/tiles.css";
import "@browser-games/game-client/lobby.css";
import "./mahjong.css";
import { Mahjong } from "./Mahjong.jsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Mahjong />
  </StrictMode>,
);
