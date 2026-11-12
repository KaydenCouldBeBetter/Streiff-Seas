import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initTheme } from "./lib/themeStore";
import { AuthFlow } from "./screens/AuthFlow";
import "./index.css";

initTheme();

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <App>
      <AuthFlow />
    </App>
  </StrictMode>,
);
