import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LandingPage } from "./LandingPage";
import "./landing.css";

const root = document.getElementById("root");
if (!root) throw new Error("UpClose landing root is missing.");
createRoot(root).render(
  <StrictMode>
    <LandingPage appOrigin={import.meta.env.VITE_APP_ORIGIN} />
  </StrictMode>,
);
