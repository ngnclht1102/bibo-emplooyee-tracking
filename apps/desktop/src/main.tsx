import React from "react";
import ReactDOM from "react-dom/client";
import "./theme.css";
import "./i18n";
import App from "./App";
import { initSentry, Sentry } from "./sentry";

initSentry();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p style={{ padding: 24 }}>Something went wrong.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
