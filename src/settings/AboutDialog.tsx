import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

type Props = {
  onClose: () => void;
};

const GITHUB_RELEASES_URL = "https://github.com/gotgam100/DropKick";

export function AboutDialog({ onClose }: Props) {
  // 설치된 앱의 실제 버전을 보여 준다 (버전을 올려도 이 파일은 고치지 않아도 된다)
  const [version, setVersion] = useState("0.7.0");
  useEffect(() => {
    if (isTauri()) getVersion().then(setVersion).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleOpenGithub = async () => {
    try {
      if (isTauri()) {
        await openUrl(GITHUB_RELEASES_URL);
      } else {
        window.open(GITHUB_RELEASES_URL, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(GITHUB_RELEASES_URL, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog about-dialog"
        role="dialog"
        aria-label="DropKick 정보"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <img
          src="/app-icon.png"
          alt="DropKick 아이콘"
          className="about-app-icon"
          width={76}
          height={76}
        />
        <h2 className="about-app-title">DropKick</h2>
        <p className="about-app-version">버전 {version}</p>

        <div className="about-spacer" />

        <button
          type="button"
          className="about-github-btn"
          onClick={handleOpenGithub}
        >
          프로그램 정보
        </button>

        <div className="about-spacer" />

        <p className="about-copyright">© 2026 DropKick. All rights reserved.</p>

        <div className="about-close-row">
          <button type="button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
