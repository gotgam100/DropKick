import { useEffect, useRef, useState } from "react";
import {
  createQuoteDeck,
  FIRST_DELAY_MS,
  GAP_DELAY_MS,
  quoteLabel,
  quoteSuffix,
  quotePool,
  randomDelay,
  SLIDE_MS,
  splitQuote,
  STAY_MS,
} from "./quoteFlow";

/** 이보다 좁으면 읽기 어려우니 그 차례는 건너뛴다 (px) */
const MIN_ROOM = 160;
/** 왼쪽 씬 제목, 오른쪽 통계와 떨어뜨릴 간격 (px) */
const SIDE_GAP = 16;
/** 한글 한 글자의 대략적인 폭(px)과 한 조각의 최소 글자 수 (작품명·연도·인물 몫은 그때그때 뺀다) */
const CHAR_PX = 11;
const MIN_PART_CHARS = 16;

/**
 * 푸터 가운데에 한국 영화 명대사가 가끔 아래에서 올라와 잠시 머물다 내려간다.
 * 순서와 나타나는 간격은 무작위. 긴 대사는 두 번에 나눠 "..."으로 잇는다.
 */
export function FooterQuote({ customQuotes }: { customQuotes: string }) {
  const [line, setLine] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [room, setRoom] = useState<{ left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = createQuoteDeck(quotePool(customQuotes));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const wait = (ms: number) => new Promise<void>((resolve) => (timer = setTimeout(resolve, ms)));
    /**
     * 푸터에서 비어 있는 자리(왼쪽 씬 제목과 오른쪽 통계 사이)를 잰다.
     * 그 자리 안에서만 보여 주므로 다른 글자를 가리지 않는다.
     */
    const measure = () => {
      const bar = ref.current?.parentElement;
      const gap = bar?.querySelector<HTMLElement>(".status-spacer");
      if (!bar || !gap) return null;
      const barBox = bar.getBoundingClientRect();
      const gapBox = gap.getBoundingClientRect();
      const width = gapBox.width - SIDE_GAP * 2;
      return width >= MIN_ROOM ? { left: gapBox.left - barBox.left + SIDE_GAP, width } : null;
    };

    const run = async () => {
      await wait(randomDelay(FIRST_DELAY_MS));
      while (!cancelled) {
        // 창이 가려져 있으면 보여 주지 않고 조금 뒤에 다시 본다
        if (document.hidden) {
          await wait(5_000);
          continue;
        }
        const quote = next();
        const room0 = measure();
        if (!room0) {
          await wait(randomDelay(GAP_DELAY_MS)); // 자리가 모자라면 이번에는 건너뛴다
          continue;
        }
        // 비어 있는 자리가 넓으면 나누지 않고 한 번에, 좁으면 둘로 나눈다. (한글 한 글자 약 11px, 작품명·연도·인물 몫은 뺀다)
        const parts = splitQuote(quote.text, Math.max(MIN_PART_CHARS, Math.floor(room0.width / CHAR_PX) - [...quoteSuffix(quote)].length));
        for (let i = 0; i < parts.length && !cancelled; i++) {
          const spot = measure();
          if (!spot) break; // 자리가 모자라면 이번에는 건너뛴다
          setRoom(spot);
          setLine(quoteLabel(parts[i], quote, i === parts.length - 1));
          await wait(50); // 글이 자리를 잡은 뒤 올라오게
          if (cancelled) return;
          setShown(true);
          await wait(SLIDE_MS + STAY_MS);
          if (cancelled) return;
          setShown(false);
          await wait(SLIDE_MS + (i < parts.length - 1 ? 300 : 0));
        }
        if (cancelled) return;
        setLine(null);
        await wait(randomDelay(GAP_DELAY_MS));
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      // 나만의 명대사를 고치면 이 흐름이 새로 시작되니, 떠 있던 글이 멈춰 남지 않게 치운다
      setShown(false);
      setLine(null);
    };
  }, [customQuotes]);

  if (!line) return <div ref={ref} className="status-quote" hidden />;
  return (
    <div ref={ref} className="status-quote" aria-hidden="true" style={room ? { left: room.left, width: room.width } : undefined}>
      <span className={`status-quote-text${shown ? " show" : ""}`}>{line}</span>
    </div>
  );
}
