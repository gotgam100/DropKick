import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StandaloneSettingsWindow } from "./settings/StandaloneSettingsWindow";
import { StandaloneGuideWindow } from "./guide/StandaloneGuideWindow";
import { installContextMenu } from "./contextMenu";

installContextMenu();

// 개발용 앱에서만: ⌘R로 화면을 새로고침한다. (배포 앱에는 들어가지 않는다)
if (import.meta.env.DEV) {
  window.addEventListener("keydown", (e) => {
    if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "r") {
      e.preventDefault();
      window.location.reload();
    }
  });
}

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
