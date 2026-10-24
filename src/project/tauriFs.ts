import { invoke } from "@tauri-apps/api/core";
import type { ProjectFs } from "./projectIO";

/** 앱(Tauri)에서 쓰는 실제 파일 시스템 */
export const tauriFs: ProjectFs = {
  readText: (path) => invoke<string>("read_script", { path }),
  writeText: (path, text) => invoke("write_script", { path, contents: text }),
  ensureDir: (path) => invoke("ensure_dir", { path }),
  listFiles: (root) => invoke<string[]>("list_files", { root }),
  kind: (path) => invoke<"file" | "dir" | "none">("path_kind", { path }),
};
