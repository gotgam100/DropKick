import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import { loadSettings, type AppSettings } from "../settings/settings";
import { ScreenplayGuideDialog } from "./ScreenplayGuideDialog";
import "../App.css";
import "../panels/panels.css";

export function StandaloneGuideWindow() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  useEffect(() => {
    if (settings.theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = settings.theme;
    }
  }, [settings.theme]);

  useEffect(() => {
    const unlisten = listen<AppSettings>("settings-changed", (event) => {
      setSettings(event.payload);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const handleClose = async () => {
    try {
      const win = getCurrentWebviewWindow();
      await win.close();
    } catch {
      window.close();
    }
  };

  const handleLoadSampleProject = async (title: string, fountainText: string) => {
    await emit("load-sample-project", { title, fountainText });
    await handleClose();
  };

  return (
    <div className="standalone-window guide-standalone">
      <ScreenplayGuideDialog
        onClose={handleClose}
        onLoadSampleProject={handleLoadSampleProject}
        isStandalone={true}
      />
    </div>
  );
}
