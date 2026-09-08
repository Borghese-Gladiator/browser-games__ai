import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@portal/shared/theme.css";
import "./trainer.css";
import { TrainerPage } from "./TrainerPage.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TrainerPage />
  </StrictMode>,
);
