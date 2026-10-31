import { ViewPlugin, type EditorView } from "@codemirror/view";

/** 마지막으로 옮겨 둔 자리. 창을 닫았다 열어도 그 자리에 뜬다. */
let saved = { x: 0, y: 0 };

function attach(panel: HTMLElement) {
  if (panel.querySelector(":scope > .cm-search-handle")) return;
  const handle = document.createElement("div");
  handle.className = "cm-search-handle";
  handle.textContent = "찾기 · 바꾸기";
  handle.title = "끌어서 위치 옮기기";
  panel.prepend(handle);

  const apply = () => {
    panel.style.transform = `translate(${saved.x}px, ${saved.y}px)`;
  };
  apply();
  // 화면 밖으로 나가 버렸으면 제자리로 돌린다.
  const keepOnScreen = () => {
    const r = panel.getBoundingClientRect();
    if (r.right < 60 || r.left > window.innerWidth - 60 || r.bottom < 60 || r.top > window.innerHeight - 60) {
      saved = { x: 0, y: 0 };
      apply();
    }
  };
  keepOnScreen();

  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    // 화면 확대(zoom) 안에 있으면 움직인 거리를 그만큼 나눠 마우스를 따라가게 한다.
    const scale = panel.getBoundingClientRect().width / panel.offsetWidth || 1;
    const start = { x: e.clientX, y: e.clientY, ox: saved.x, oy: saved.y };
    const move = (ev: PointerEvent) => {
      saved = { x: start.ox + (ev.clientX - start.x) / scale, y: start.oy + (ev.clientY - start.y) / scale };
      apply();
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      keepOnScreen();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
}

/** 찾기·바꾸기 창에 제목줄을 붙여, 끌어서 옮길 수 있게 한다. */
export function searchPanelDrag() {
  const ensure = (view: EditorView) => {
    const panel = view.dom.querySelector<HTMLElement>(".cm-search");
    if (panel) attach(panel);
  };
  return ViewPlugin.define((view) => {
    ensure(view);
    // 창은 이 갱신 도중이 아니라 바로 뒤에 만들어지므로, 한 박자 늦게 확인한다.
    return { update: (update) => void setTimeout(() => ensure(update.view), 0) };
  });
}
