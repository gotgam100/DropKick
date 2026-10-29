import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import {
  loadSettings,
  saveSettings,
  clearAllAppStorage,
  type AppSettings,
} from "./settings";
import { loadPresets, savePresets, type DocPreset } from "../project/presets";
import { SettingsDialog } from "./SettingsDialog";
import "../App.css";
import "../panels/panels.css";

export function StandaloneSettingsWindow() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [presets, setPresets] = useState<DocPreset[]>(() => loadPresets());

  useEffect(() => {
    if (settings.theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = settings.theme;
    }
  }, [settings.theme]);

  // 다른 창에서 설정이나 프리셋이 바뀌었을 때 실시간 동기화
  useEffect(() => {
    const unlistenSettings = listen<AppSettings>("settings-changed", (event) => {
      setSettings(event.payload);
    });
    const unlistenPresets = listen<DocPreset[]>("presets-changed", (event) => {
      setPresets(event.payload);
    });

    return () => {
      unlistenSettings.then((f) => f());
      unlistenPresets.then((f) => f());
    };
  }, []);

  const handleChangeSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
    emit("settings-changed", next);
  };

  const handleUpdatePresets = (next: DocPreset[]) => {
    setPresets(next);
    savePresets(next);
    emit("presets-changed", next);
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

  const handleOpenNewPreset = () => {
    emit("open-preset-editor", { initial: null });
  };

  const handleEditPreset = (preset: DocPreset) => {
    emit("open-preset-editor", { initial: preset });
  };

  return (
    <div className="standalone-window settings-standalone">
      <SettingsDialog
        settings={settings}
        presets={presets}
        onChangeSettings={handleChangeSettings}
        onUpdatePresets={handleUpdatePresets}
        onOpenNewPreset={handleOpenNewPreset}
        onEditPreset={handleEditPreset}
        onFullResetApp={handleFullResetApp}
        onClose={handleClose}
        isStandalone={true}
      />
    </div>
  );
}
