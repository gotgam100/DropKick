import { isTauri } from "@tauri-apps/api/core";
import { EditorView } from "@codemirror/view";
import { formatAvailability } from "./editor/scriptView";
import { Menu, type MenuItemOptions, type PredefinedMenuItemOptions, type SubmenuOptions } from "@tauri-apps/api/menu";

/**
 * 우클릭 메뉴를 앱에 필요한 것만 남긴다.
 * 맥이 기본으로 붙이는 번역·AI 글쓰기 도구·자동 완성·서비스·개발자 도구 항목은 앱에서 쓸 수 없으므로,
 * 글을 고치는 곳에서는 잘라내기/복사/붙이기/전체 선택만 보이는 메뉴를 대신 띄운다.
 */
export function installContextMenu(): void {
  if (!isTauri()) return;
  window.addEventListener("contextmenu", (e) => {
    // 폴더 트리처럼 자기 메뉴가 있는 곳은 그대로 둔다.
    if (e.defaultPrevented) return;
    e.preventDefault();
    const target = e.target as HTMLElement | null;
    const editable = target?.closest(".cm-content, textarea, input") as HTMLElement | null;
    const hasSelection = (window.getSelection()?.toString() ?? "") !== "";
    if (!editable && !hasSelection) return;
    // 원고에서 글을 골랐으면 '메모' 항목을 맨 위에 더한다.
    const canNote = Boolean(editable?.closest("[data-script-editor]")) && hasSelection;
    void (async () => {
      const items: Array<MenuItemOptions | PredefinedMenuItemOptions | SubmenuOptions> = editable
        ? [
            { item: "Cut" as const, text: "잘라내기" },
            { item: "Copy" as const, text: "복사" },
            { item: "Paste" as const, text: "붙이기" },
            { item: "Separator" as const },
            { item: "SelectAll" as const, text: "전체 선택" },
          ]
        : [{ item: "Copy" as const, text: "복사" }, { item: "SelectAll" as const, text: "전체 선택" }];
      if (canNote) {
        items.unshift(
          {
            id: "add-note",
            text: "메모",
            action: () => window.dispatchEvent(new CustomEvent("dropkick:add-note")),
          },
          { item: "Separator" },
        );
      }
      // 원고에서는 "글자 모양" 하위 메뉴를 더한다. (단축키와 같은 일을 한다)
      if (editable?.closest("[data-script-editor]")) {
        const send = (kind: string) => () => window.dispatchEvent(new CustomEvent("dropkick:text-format", { detail: kind }));
        // 이 줄의 요소에서 쓸 수 없는 항목은 흐리게 보인다.
        const cm = editable.closest(".cm-editor") as HTMLElement | null;
        const view = cm ? EditorView.findFromDOM(cm) : null;
        const can = view ? formatAvailability(view) : { inline: true, block: true };
        items.unshift(
          {
            text: "글자 모양",
            items: [
              { id: "fmt-bold", text: "굵게", accelerator: "CmdOrCtrl+B", enabled: can.inline, action: send("bold") },
              { id: "fmt-italic", text: "기울임", accelerator: "CmdOrCtrl+I", enabled: can.inline, action: send("italic") },
              { id: "fmt-underline", text: "밑줄", accelerator: "CmdOrCtrl+U", enabled: can.inline, action: send("underline") },
              { item: "Separator" },
              { id: "fmt-left", text: "좌측 정렬", enabled: can.block, action: send("left") },
              { id: "fmt-center", text: "가운데 정렬", accelerator: "CmdOrCtrl+E", enabled: can.block, action: send("center") },
              { id: "fmt-right", text: "우측 정렬", enabled: can.block, action: send("right") },
              { item: "Separator" },
              { id: "fmt-indent", text: "들여쓰기", accelerator: "CmdOrCtrl+]", enabled: can.block, action: send("indent") },
              { id: "fmt-outdent", text: "내어쓰기", accelerator: "CmdOrCtrl+[", enabled: can.block, action: send("outdent") },
            ],
          },
          { item: "Separator" },
        );
        // 메모가 있으면 맨 위로 (메모 → 글자 모양 → 편집)
        if (canNote) {
          const [fmt, sep] = items.splice(0, 2);
          items.splice(2, 0, fmt, sep);
        }
      }
      const menu = await Menu.new({ items });
      await menu.popup();
    })().catch(() => {});
  });
}
