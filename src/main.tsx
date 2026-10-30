import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StandaloneSettingsWindow } from "./settings/StandaloneSettingsWindow";
import { StandaloneGuideWindow } from "./guide/StandaloneGuideWindow";
import { installContextMenu } from "./contextMenu";

installContextMenu();

const params = new URLSearchParams(window.location.search);
const aux = params.get("aux");

function Root() {
  if (aux === "settings") {
    return <StandaloneSettingsWindow />;
  }
  if (aux === "guide") {
    return <StandaloneGuideWindow />;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
