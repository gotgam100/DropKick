/** 이번 달에 쓴 AI 토큰 수. 이 맥의 브라우저 저장소에만 적는다. (실제 청구액이 아니라 참고용) */
const KEY = "dropkick.ai.usage.v1";

export type Usage = { month: string; input: number; output: number; cached: number; calls: number };

export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function emptyUsage(month: string): Usage {
  return { month, input: 0, output: 0, cached: 0, calls: 0 };
}

export function addUsage(prev: Usage, add: { input: number; output: number; cached: number }, now: Date): Usage {
  const base = prev.month === monthOf(now) ? prev : emptyUsage(monthOf(now));
  return {
    month: base.month,
    input: base.input + add.input,
    output: base.output + add.output,
    cached: base.cached + add.cached,
    calls: base.calls + 1,
  };
}

export function loadUsage(now = new Date()): Usage {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    const u = raw ? (JSON.parse(raw) as Partial<Usage>) : null;
    if (u && u.month === monthOf(now)) {
      return { month: u.month, input: u.input ?? 0, output: u.output ?? 0, cached: u.cached ?? 0, calls: u.calls ?? 0 };
    }
  } catch {
    // 기록이 없으면 처음부터
  }
  return emptyUsage(monthOf(now));
}

export function recordUsage(add: { input: number; output: number; cached: number }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(addUsage(loadUsage(), add, new Date())));
  } catch {
    // 기록하지 못해도 기능에는 영향이 없다.
  }
}
