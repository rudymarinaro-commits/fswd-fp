import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./contexts/AuthProvider";
import { SocketProvider } from "./contexts/SocketProvider";

import "./index.css"; // IMPORT GLOBALE

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <SocketProvider>
        <App />
      </SocketProvider>
    </AuthProvider>
  </React.StrictMode>
);
