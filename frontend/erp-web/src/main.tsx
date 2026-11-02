import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "./erp-redesign.css";
import "./dynamics-workbench.css";
import "./screen-title.css";
import "./global-components.css";
import "./module-workspace.css";
import "./form-design-system.css";

// A tab can outlive a deployment and retain an old lazy-chunk URL. Revalidate
// the app shell once for that failed chunk so the browser loads the new hashes.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const message =
    event.payload instanceof Error ? event.payload.message : "stale-app-chunk";
  const failedAsset =
    message.match(/(?:https?:\/\/[^\s)]+|\/assets\/[^\s)]+\.js)/)?.[0] ||
    message;
  const retryKey = `nexora:preload-retry:${failedAsset}`;

  if (!sessionStorage.getItem(retryKey)) {
    sessionStorage.setItem(retryKey, "1");
    window.location.reload();
    return;
  }

  if (document.getElementById("nexora-preload-recovery")) return;
  const recovery = document.createElement("div");
  recovery.id = "nexora-preload-recovery";
  recovery.setAttribute("role", "alert");
  Object.assign(recovery.style, {
    position: "fixed",
    inset: "auto 16px 16px",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    padding: "14px 16px",
    border: "1px solid #d7e0eb",
    borderRadius: "10px",
    background: "#fff",
    color: "#14243a",
    boxShadow: "0 12px 36px #102a4333",
    font: "14px system-ui, sans-serif",
  });
  const text = document.createElement("span");
  text.textContent =
    "Uygulama güncellendi. Devam etmek için sayfayı yenileyin.";
  const reload = document.createElement("button");
  reload.type = "button";
  reload.textContent = "Sayfayı yenile";
  Object.assign(reload.style, {
    flex: "0 0 auto",
    padding: "9px 12px",
    border: "0",
    borderRadius: "7px",
    background: "#f7c43b",
    color: "#14243a",
    cursor: "pointer",
    font: "inherit",
    fontWeight: "650",
  });
  reload.addEventListener("click", () => window.location.reload());
  recovery.append(text, reload);
  document.body.append(recovery);
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
