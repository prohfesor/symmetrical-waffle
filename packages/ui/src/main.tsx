import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { AppStateProvider } from "./state/store.js";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </React.StrictMode>,
);
