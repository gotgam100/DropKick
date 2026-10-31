import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import {
  loadSettings,
  saveSettings,
  clearAllAppStorage,
  type AppSettings,
} from "./settings";
import { SettingsDialog } from "./SettingsDialog";
import "../App.css";
import "../panels/panels.css";

export function StandaloneSettingsWindow() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  useEffect(() => {
    if (settings.theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = settings.theme;
    }
  }, [settings.theme]);

  // 다른 창에서 설정이 바뀌었을 때 실시간 동기화
  useEffect(() => {
    const unlistenSettings = listen<AppSettings>("settings-changed", (event) => {
      setSettings(event.payload);
    });

    return () => {
      unlistenSettings.then((f) => f());
    };
  }, []);

  const handleChangeSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
    emit("settings-changed", next);
  };

  const handleClose = async () => {
    try {
      const win = getCurrentWebviewWindow();
      await win.close();
    } catch {
      window.close();
    }
  };

  const handleFullResetApp = async () => {
    clearAllAppStorage();
    await emit("app-reset");
    await handleClose();
  };

  return (
    <div className="standalone-window settings-standalone">
      <SettingsDialog
        settings={settings}
        onChangeSettings={handleChangeSettings}
        onFullResetApp={handleFullResetApp}
        onClose={handleClose}
        isStandalone={true}
      />
    </div>
  );
}
