/**
 * 트랙패드 "탭하여 클릭" 보정.
 *
 * 맥의 웹뷰(WKWebView)는 트랙패드를 탭할 때 가끔 "손 뗌(mouseup)"을 "누름(mousedown)"보다 먼저 보낸다.
 * 그러면 뒤늦게 온 누름이 짝 없이 남아서
 *   - 그 탭은 클릭이 되지 않고 (꾹 눌러야 눌린다)
 *   - 남은 누름이 다음 탭의 손 뗌과 짝이 되어 엉뚱한 곳이 눌리거나, 커서를 움직이면 끌기가 된다.
 * 뒤집혀 온 누름은 버튼이 눌려 있지 않다(buttons === 0)는 점으로 알아본다. 진짜 누름은 buttons가 1이다.
 *
 * 보정: 뒤집힌 누름이 오면 곧바로 손 뗌(pointerup·mouseup)과 클릭을 대신 보내 탭을 마무리하고,
 * 웹뷰가 남은 누름과 다음 손 뗌으로 만들어 내는 엉뚱한 클릭 하나는 막는다.
 */

export type TapFixState = {
  /** 짝 없이 남은(뒤집혀 온) 누름이 있다 */
  staleDown: boolean;
  /** 다음 진짜 클릭을 막는다 (남은 누름과 새 손 뗌이 만든 클릭) */
  suppressClick: boolean;
};

export type TapFixAction = "none" | "finish-tap" | "suppress";

/** 이벤트 하나를 받아 상태를 바꾸고, 해야 할 일을 돌려준다. (화면 없이 시험할 수 있게 순수 함수로 둔다) */
export function tapFixStep(
  state: TapFixState,
  event: { type: "mousedown" | "mouseup" | "click"; button: number; buttons: number; trusted: boolean; detail?: number },
): TapFixAction {
  if (!event.trusted || event.button !== 0) return "none";
  if (event.type === "mousedown") {
    if (event.buttons === 0) {
      // 뒤집혀 온 누름: 탭을 대신 마무리한다
      state.staleDown = true;
      state.suppressClick = false;
      return "finish-tap";
    }
    // 진짜 누름이 오면 남은 누름은 없어진 것으로 본다
    state.staleDown = false;
    state.suppressClick = false;
    return "none";
  }
  if (event.type === "mouseup") {
    // 남은 누름이 있는데 손 뗌이 오면, 웹뷰는 그 둘로 클릭을 만든다: 그 클릭은 막는다
    if (state.staleDown) {
      state.staleDown = false;
      state.suppressClick = true;
    }
    return "none";
  }
  // click. 키보드(Enter·Space)로 누른 클릭은 detail이 0이라 막지 않는다
  if (state.suppressClick && (event.detail ?? 1) > 0) {
    state.suppressClick = false;
    return "suppress";
  }
  return "none";
}

const SYNTHETIC = Symbol("dropkick-tap-fix");

export function installTapFix() {
  if (typeof window === "undefined") return;
  const state: TapFixState = { staleDown: false, suppressClick: false };

  const finishTap = (down: MouseEvent) => {
    const target = down.target instanceof Element ? down.target : null;
    if (!target) return;
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: down.clientX,
      clientY: down.clientY,
      screenX: down.screenX,
      screenY: down.screenY,
      metaKey: down.metaKey,
      shiftKey: down.shiftKey,
      altKey: down.altKey,
      ctrlKey: down.ctrlKey,
      button: 0,
      buttons: 0,
      detail: 1,
      view: window,
    };
    // 누름 처리(포커스, 끌기 준비 등)가 끝난 다음에 손 뗌과 클릭을 보낸다
    window.setTimeout(() => {
      const mark = <T extends Event>(e: T) => Object.assign(e, { [SYNTHETIC]: true });
      if (typeof PointerEvent !== "undefined") {
        target.dispatchEvent(mark(new PointerEvent("pointerup", { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true })));
      }
      target.dispatchEvent(mark(new MouseEvent("mouseup", init)));
      // 원고 편집기 안은 누름만으로 커서가 놓이니 클릭은 보내지 않는다.
      // Control+클릭은 맥에서 우클릭(메뉴)이라 클릭을 보내지 않는다.
      if (!down.ctrlKey && !target.closest(".cm-editor") && target.isConnected) target.dispatchEvent(mark(new MouseEvent("click", init)));
    }, 0);
  };

  const onEvent = (e: Event) => {
    const m = e as MouseEvent;
    if ((e as unknown as Record<symbol, boolean>)[SYNTHETIC]) return;
    const action = tapFixStep(state, {
      type: e.type as "mousedown" | "mouseup" | "click",
      button: m.button,
      buttons: m.buttons,
      trusted: e.isTrusted,
      detail: m.detail,
    });
    if (action === "finish-tap") finishTap(m);
    else if (action === "suppress") {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  for (const type of ["mousedown", "mouseup", "click"]) window.addEventListener(type, onEvent, { capture: true });
}
