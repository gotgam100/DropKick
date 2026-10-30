import { isTauri } from "@tauri-apps/api/core";
import { Menu, type MenuItemOptions, type PredefinedMenuItemOptions } from "@tauri-apps/api/menu";

/**
 * 우클릭 메뉴를 앱에 필요한 것만 남긴다.
 * 맥이 기본으로 붙이는 번역·AI 글쓰기 도구·자동 완성·서비스·개발자 도구 항목은 앱에서 쓸 수 없으므로,
 * 글을 고치는 곳에서는 잘라내기/복사하기/붙이기/전체 선택만 보이는 메뉴를 대신 띄운다.
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
      const items: Array<MenuItemOptions | PredefinedMenuItemOptions> = editable
        ? [
            { item: "Cut" as const, text: "잘라내기" },
            { item: "Copy" as const, text: "복사하기" },
            { item: "Paste" as const, text: "붙이기" },
            { item: "Separator" as const },
            { item: "SelectAll" as const, text: "전체 선택" },
          ]
        : [{ item: "Copy" as const, text: "복사하기" }, { item: "SelectAll" as const, text: "전체 선택" }];
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
      const menu = await Menu.new({ items });
      await menu.popup();
    })().catch(() => {});
  });
}
