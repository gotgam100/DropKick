/**
 * 자동 업데이트 (Tauri 업데이트 기능)
 *
 * - 앱을 켜고 잠시 뒤, 그리고 메뉴 "업데이트 확인…"에서 새 버전을 확인한다.
 * - 새 버전 정보는 공개 저장소 gotgam100/DropKick_releases의 최신 Release(latest.json)에서 받는다.
 * - 받은 파일은 DropKick 업데이트 서명을 확인한 뒤에만 설치된다.
 * - 설치 전에 작업 중인 프로젝트를 저장(또는 저장 여부 질문)하고, 설치 후 앱을 다시 시작한다.
 */
import { useCallback, useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { message } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

const STARTUP_DELAY = 5000;

type Options = {
  /** 설치 전에 작업을 저장한다. 계속해도 되면 true */
  prepare: () => Promise<boolean>;
  /** 진행 상황 알림 */
  notify: (text: string | null) => void;
};

export function useUpdater({ prepare, notify }: Options) {
  const busyRef = useRef(false);
  const prepareRef = useRef(prepare);
  const notifyRef = useRef(notify);
  prepareRef.current = prepare;
  notifyRef.current = notify;

  const install = useCallback(async (update: Update) => {
    if (!(await prepareRef.current())) return;
    let total = 0;
    let received = 0;
    notifyRef.current("업데이트를 받는 중…");
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? 0;
      if (event.event === "Progress") {
        received += event.data.chunkLength;
        if (total > 0) notifyRef.current(`업데이트를 받는 중… ${Math.round((received / total) * 100)}%`);
      }
      if (event.event === "Finished") notifyRef.current("업데이트를 설치했습니다. 다시 시작합니다…");
    });
    await relaunch();
  }, []);

  /** 새 버전 확인. quiet면 새 버전이 없을 때나 확인에 실패했을 때 아무것도 띄우지 않는다. */
  const checkForUpdate = useCallback(
    async (quiet: boolean) => {
      if (!isTauri() || busyRef.current) return;
      busyRef.current = true;
      try {
        const update = await check();
        if (!update) {
          if (!quiet) {
            await message(`최신 버전을 쓰고 있습니다.\n(DropKick ${await getVersion()})`, {
              title: "업데이트 확인",
              kind: "info",
            });
          }
          return;
        }
        const notes = update.body?.trim() ? `\n\n바뀐 점\n${update.body.trim()}` : "";
        const answer = await message(
          `새 버전 ${update.version}이(가) 나왔습니다. (지금 ${update.currentVersion})${notes}\n\n지금 설치할까요? 설치하면 DropKick이 다시 시작됩니다.`,
          { title: "DropKick 업데이트", kind: "info", buttons: { ok: "지금 설치", cancel: "나중에" } },
        );
        if (answer === "지금 설치" || answer === "Ok") await install(update);
      } catch (error) {
        notifyRef.current(null);
        if (!quiet) {
          const detail = error instanceof Error ? error.message : String(error);
          await message(`업데이트를 확인하지 못했습니다. 인터넷 연결을 확인해 주세요.\n\n${detail}`, {
            title: "업데이트 확인",
            kind: "warning",
          });
        }
      } finally {
        busyRef.current = false;
      }
    },
    [install],
  );

  // 켜고 잠시 뒤 조용히 확인 (개발 중에는 하지 않는다)
  useEffect(() => {
    if (!isTauri() || import.meta.env.DEV) return;
    const timer = setTimeout(() => checkForUpdate(true), STARTUP_DELAY);
    return () => clearTimeout(timer);
  }, [checkForUpdate]);

  // 메뉴 "업데이트 확인…"
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<string>("menu", (event) => {
      if (event.payload === "check_update") checkForUpdate(false);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [checkForUpdate]);
}
