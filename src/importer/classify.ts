/**
 * 시나리오 문서(PDF·Word)의 줄들을 DropKick의 7가지 줄 스타일로 나눈다. AI는 쓰지 않는다.
 *
 * 시나리오는 스타일마다 놓이는 자리가 정해져 있다. (액션은 왼쪽, 인물은 안쪽, 대사는 더 안쪽)
 * 그래서 문서 안에서 "글이 시작하는 위치"를 모아 보고, 어느 위치가 인물이고 어느 위치가
 * 대사인지를 문서마다 스스로 알아낸 다음 줄마다 스타일을 붙인다.
 *
 *  1. 쪽 번호·머리말·꼬리말, (MORE)/(CONT'D) 같은 군더더기를 걷어 낸다.
 *  2. 글이 시작하는 위치를 모아 "액션 위치"와 "안쪽 위치들"을 찾고,
 *     짧고 같은 이름이 반복되는 안쪽 위치를 인물로 정한다.
 *  3. 줄마다 씬헤딩·전환·인물·괄호지문·대사·액션을 정한다.
 *  4. 화면 폭 때문에 나뉜 줄을 문단으로 이어 붙인다.
 */
import type { LineStyle } from "../editor/styles";
import { CENTER_X, RIGHT_X, type Answers, type ImportedScript, type Question, type ImportReport, type ReviewItem, type ReviewKind, type Row, type Seg } from "./types";

type Role = LineStyle;

type Item = {
  role: Role;
  text: string;
  page: number;
  y: number;
  x: number;
  paragraph: boolean;
  right: number;
  size: number;
  /** 이 줄이 위 줄과 같은 줄(row)에서 나왔는지 */
  sameRowAsPrev: boolean;
  /** 앞 대사에서 줄을 바꿔 이어 쓴 대사 (앞 대사에 붙인다) */
  cont?: boolean;
};

const CLUSTER_GAP = 5;
/** 줄이 "끝까지 찼다"고 보는 여유 (pt). 한국어는 단어 하나쯤 남기고 줄을 바꾼다 */
const FULL_LINE_SLACK = 6;
const TIME_WORDS = "낮|밤|아침|저녁|새벽|오전|오후|해질녘|해질 녘|한낮|한밤|동틀 녘|DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|SUNSET|SUNRISE|D|N";
const TRANSITION = /^(FADE\s*(IN|OUT|TO)|CUT\s*TO|DISSOLVE|SMASH\s*CUT|MATCH\s*CUT|WIPE|페이드|컷\s*투|디졸브|암전|F\.?\s*[IO]\.?|O\.?\s*L\.?|W\.?\s*[IO]\.?|DIS\.?|오버랩|화이트\s*(?:아웃|인)|블랙\s*(?:아웃|인)|FADE)(?![가-힣A-Za-z])/i;
/** 줄 하나가 통째로 서브 헤더인 표기: 인서트·자막·플래시백·챕터 등 */
const SUBHEADER_TEXT = /^(?:[\[(【]\s*(?:자막|인서트|플래시백|회상|SUPER)\s*[\])】]|(?:CHAPTER|챕터|시퀀스|SEQUENCE|SEQ)\.?\s*\d+|(?:플래시백|회상|인서트|자막|SUPER|INSERT)\s*(?:[:.\-–—>＞》]|끝|시작|$)|[(（](?:과거|현재|회상|꿈|환상)[)）]\.?$)/i;
const IN_OUT = /^(실내|실외|내부|외부|INT|EXT|I\/E|E\/I)(?=[.\s/,]|$)/i;
const NOISE = /^\(?\s*(MORE|계속)\s*\)?$/i;
const CONTD = /\s*\(\s*(CONT['’]?D\.?|CONT\.?|계속)\s*\)\s*$/i;

function normalize(text: string): string {
  return text.replace(/[\u0000\u200b\u00a0]/g, " ").replace(/\s+/g, " ").trim();
}

function isParenthetical(text: string): boolean {
  return /^[(（].*[)）]$/.test(text);
}

function terminal(text: string): boolean {
  return /[.!?…。？！”"')\]」』]$/.test(text);
}

// ---------- 1. 군더더기 걷어 내기 ----------

/** "2 실내. 미숙의 집 - 낮"처럼 씬 번호가 앞에 붙고 오른쪽 끝에도 같은 번호가 있는 줄에서 번호를 뗀다 */
function stripSceneNumber(row: Row): Row {
  const first = row.segs[0];
  const m = first && /^(\d{1,4})\s+(.+)$/.exec(first.text);
  if (!m || !IN_OUT.test(m[2])) return row;
  const rest = row.segs.slice(1).filter((s) => s.text !== m[1]);
  return { ...row, segs: [{ ...first, text: m[2] }, ...rest] };
}

function cleanRows(rows: Row[]): { rows: Row[]; removed: number } {
  const pages = new Set(rows.map((r) => r.page)).size;
  const counts = new Map<string, Set<number>>();
  const edge = (r: Row) =>
    r.pageHeight !== undefined && (r.y < r.pageHeight * 0.09 || r.y > r.pageHeight * 0.91);
  for (const row of rows) {
    if (!edge(row)) continue;
    const key = normalize(row.segs.map((s) => s.text).join(" ")).replace(/\d+/g, "#");
    if (!counts.has(key)) counts.set(key, new Set());
    counts.get(key)!.add(row.page);
  }
  const repeated = (r: Row) => {
    if (!edge(r) || pages < 3) return false;
    const key = normalize(r.segs.map((s) => s.text).join(" ")).replace(/\d+/g, "#");
    return (counts.get(key)?.size ?? 0) >= Math.max(3, Math.ceil(pages * 0.4));
  };
  let removed = 0;
  const kept: Row[] = [];
  for (const row of rows) {
    const text = normalize(row.segs.map((s) => s.text).join(" "));
    const pageNumber = edge(row) && /^([-–—\s]*\d{1,4}[-–—.\s]*|\d{1,4}\s*[/／]\s*\d{1,4})$/.test(text);
    if (!text || pageNumber || repeated(row) || NOISE.test(text)) {
      if (text) removed++;
      continue;
    }
    kept.push(stripSceneNumber({ ...row, segs: row.segs.map((s) => ({ ...s, text: normalize(s.text) })).filter((s) => s.text) }));
  }
  return { rows: kept.filter((r) => r.segs.length > 0), removed };
}

/** "민재: 안녕하세요."처럼 이름과 대사를 콜론으로 이은 줄 */
const COLON_DIALOGUE = /^([^\s:：,，.!?…()（）\d][^\s:：,，.!?…()（）]{0,9}(?:\s?\d{1,2})?(?:\s*[(（][^)）]{1,10}[)）])?)\s*[:：]\s*(.+)$/;
/** 콜론 앞이 이름이 아니라 이름표인 낱말들 */
const COLON_LABEL = /^(자막|인서트|플래시백|회상|참고|주|메모|비고|장소|시간|날짜|제목|작가|각본|연출|씬\d*|INS|SC|S|NOTE|SUPER)$/i;

/** 같은 이름이 콜론 대사로 되풀이되는 문서면, 그 줄들을 이름 + 대사 두 덩어리로 나눈다 */
function splitColonDialogue(rows: Row[]): Row[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    if (row.segs.length !== 1) continue;
    const m = COLON_DIALOGUE.exec(row.segs[0].text);
    if (!m || COLON_LABEL.test(nameKey(m[1])) || parseSceneHeading(row.segs[0].text)) continue;
    counts.set(nameKey(m[1]), (counts.get(nameKey(m[1])) ?? 0) + 1);
  }
  const names = new Set([...counts].filter(([, n]) => n >= 2).map(([name]) => name));
  for (const n of counts.values()) if (n >= 2) total += n;
  if (names.size === 0 || total < 4) return rows;
  return rows.map((row) => {
    if (row.segs.length !== 1) return row;
    const seg = row.segs[0];
    const m = COLON_DIALOGUE.exec(seg.text);
    if (!m || !names.has(nameKey(m[1]))) return row;
    return { ...row, segs: [{ ...seg, text: m[1].trim(), right: undefined }, { ...seg, x: seg.x + 200, text: m[2].trim() }] };
  });
}

// ---------- 2. 위치 모으기 ----------

type Cluster = { x: number; count: number; texts: string[] };

function clusterXs(rows: Row[], pick: (row: Row, seg: Seg, index: number) => boolean): Cluster[] {
  const points: { x: number; text: string }[] = [];
  for (const row of rows) row.segs.forEach((seg, i) => pick(row, seg, i) && points.push({ x: seg.x, text: seg.text }));
  points.sort((a, b) => a.x - b.x);
  const clusters: (Cluster & { sum: number })[] = [];
  for (const p of points) {
    const last = clusters[clusters.length - 1];
    if (last && p.x - last.x <= CLUSTER_GAP) {
      last.count++;
      last.sum += p.x;
      last.texts.push(p.text);
      last.x = last.sum / last.count;
    } else clusters.push({ x: p.x, sum: p.x, count: 1, texts: [p.text] });
  }
  return clusters;
}

/** "(길동)"처럼 이름 전체를 괄호로 감싼 표기(목소리·화면 밖 소리)면 안쪽 이름, 아니면 그대로 */
function unwrapName(text: string): string {
  const m = /^[(（]\s*([^()（）]{1,12}?)\s*[)）]$/.exec(text.trim());
  return m ? m[1] : text;
}

function isShortName(text: string): boolean {
  const name = unwrapName(text).replace(CONTD, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  return name.length > 0 && name.length <= 12 && !/[.!?…,~]$/.test(name) && !isParenthetical(name);
}

function nameKey(text: string): string {
  return unwrapName(text).replace(CONTD, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function characterScore(cluster: Cluster): number {
  const n = cluster.texts.length;
  if (n < 2) return 0;
  const counts = new Map<string, number>();
  for (const t of cluster.texts) counts.set(nameKey(t), (counts.get(nameKey(t)) ?? 0) + 1);
  const short = cluster.texts.filter(isShortName).length / n;
  const repeat = cluster.texts.filter((t) => (counts.get(nameKey(t)) ?? 0) >= 2).length / n;
  return short * 0.5 + repeat * 0.5;
}

// ---------- 3. 씬헤딩 ----------


/** 씬헤딩이면 DropKick 형식 글("실내. 장소 - 낮")로, 아니면 null */
export function parseSceneHeading(raw: string): string | null {
  // ■ ◆ ○ 같은 머리 기호는 떼고 본다
  let text = raw.trim().replace(/^[■□◆◇●○◎▶▷▪▫※★☆]+\s*/, "");
  if (text.length > 70) return null;
  // 씬 번호(#1, S#1, SC#1, 1.)가 붙은 줄은 씬헤딩으로 먼저 본다. 번호는 떼고 새로 매긴다.
  let numbered = false;
  // 번호 자리가 비어 있는 "SC#_ 마을버스"도 번호표로 본다
  const tagged =
    /^(?:SC\s*#?|S\s*#|씬\s*#?|#)[_\s]*\d+\s*[.):\-_]?\s*(.*)$/i.exec(text) ?? /^(?:SC|S)\s*#[_\s]+(.+)$/i.exec(text);
  const plain = /^\d+\s*[.):]\s*(.+)$/.exec(text);
  if (tagged && tagged[1]) {
    // "SC#_ 1. 슈퍼 앞"처럼 번호가 겹치거나 밑줄이 앞에 남은 것도 정리한다
    text = tagged[1].replace(/^[_\s]+/, "").replace(/^\d+\s*[.)]\s*/, "").trim();
    numbered = true;
  } else if (plain && !/[.!?…。？！]$/.test(plain[1])) {
    text = plain[1].trim();
    numbered = true;
  }

  // "미숙의 집 (낮, 실내)", "카페 (실내_밤)" 처럼 괄호에 시간과 실내외를 적은 형식
  const meta = /^(.+?)\s*[(（]\s*([^)）]+?)\s*[)）]$/.exec(text);
  if (meta && (numbered || (meta[1].length <= 30 && !/[.!?…。？！]$/.test(meta[1])))) {
    const parts = meta[2].split(/[,，/·_]\s*/).map((p) => p.trim()).filter(Boolean);
    const isIo = (p: string) => /^(실내|실외|내부|외부|INT|EXT|I|E)$/i.test(p);
    const isTime = (p: string) => new RegExp(`^(${TIME_WORDS})$`, "i").test(p);
    // 번호가 없으면 "(웃으며)" 같은 괄호지문과 헷갈리지 않게 모두 실내외·시간 낱말일 때만 본다
    if (numbered || (parts.length > 0 && parts.every((p) => isIo(p) || isTime(p)))) {
      const io = parts.find((p) => isIo(p) && p.length > 1);
      const time = parts.find((p) => p !== io);
      if (io || time) {
        const place = meta[1].trim();
        return `${io ? `${io}. ` : ""}${place}${time ? ` - ${time}` : ""}`;
      }
    }
  }

  if (IN_OUT.test(text)) return text;
  if (numbered) return text;
  // "카페 / 밤" 처럼 슬래시로 시간을 붙인 형식
  const slash = new RegExp(`^(.{1,30}?)\\s*[/／]\\s*(${TIME_WORDS})\\.?$`, "i").exec(text);
  if (slash && !/[.!?…。？！]$/.test(slash[1])) return `${slash[1].trim()} - ${slash[2]}`;
  const timeEnd = new RegExp(`(?:\\s[-–—]\\s*|\\s)(${TIME_WORDS})\\.?$`, "i");
  if (/ [-–—] /.test(text) && timeEnd.test(text) && !isParenthetical(text)) return text;
  return null;
}

// ---------- 본체 ----------

export function classifyRows(input: Row[], answers: Answers = {}): ImportedScript {
  const review: ReviewItem[] = [];
  const questions: Question[] = [];
  const flag = (kind: ReviewKind, page: number, text: string) => review.push({ kind, page, text: text.slice(0, 40) });

  // 표지: 첫 쪽에 씬헤딩과 인물이 없고 글이 몇 줄 안 되면 제목 쪽으로 본다. (맞는지는 작가에게 물어본다)
  // 쪽 구분이 없는 문서(Word·hwpx)는 첫 씬헤딩 앞의 짧은 줄 몇 개를 표지로 본다.
  let title: string | null = null;
  let rows = input;
  const hasScene = (r: Row) => r.segs.some((s) => parseSceneHeading(s.text));
  let coverRows: Row[] = [];
  let laterRows: Row[] = [];
  const firstPage = rows[0]?.page;
  if (rows.length > 0 && rows.every((r) => r.paragraph && r.page === firstPage)) {
    const at = rows.findIndex(hasScene);
    if (at > 0 && at <= 6 && rows.slice(0, at).every((r) => r.segs.length === 1 && r.segs[0].text.length <= 30 && !r.segs[0].hint)) {
      coverRows = rows.slice(0, at);
      laterRows = rows.slice(at);
    }
  } else {
    const first = rows.filter((r) => r.page === firstPage);
    if (first.length > 0 && first.length <= 9 && !first.some(hasScene) && rows.some((r) => r.page !== firstPage && hasScene(r))) {
      coverRows = first;
      laterRows = rows.filter((r) => r.page !== firstPage);
    }
  }
  if (coverRows.length > 0) {
    const segs = coverRows.flatMap((r) => r.segs);
    const biggest = segs.some((s) => s.size) ? [...segs].sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0] : segs[0];
    const guess = biggest ? biggest.text.replace(/^[<《「『"'‘“]+|[>》」』"'’”]+$/g, "").trim() : "";
    if (answers.cover === undefined) questions.push({ id: "cover", title: guess });
    if (answers.cover?.isCover !== false) {
      title = (answers.cover?.title.trim() || guess) || null;
      rows = laterRows;
    }
  }

  const cleaned = cleanRows(rows);
  rows = splitColonDialogue(cleaned.rows);

  const allSegs = rows.flatMap((r) => r.segs);
  const total = allSegs.length;
  if (total === 0) {
    return { title, lines: [], report: { scenes: 0, characters: [], dialogues: 0, actions: 0, review, removed: cleaned.removed }, questions };
  }

  // 같은 줄에 이름과 대사가 나란히 있는 경우 (둘째 덩어리의 위치는 대사 위치)
  const inlineSecond = clusterXs(rows, (_r, _s, i) => i >= 1);
  const inlineFirstRows = rows.filter((r) => r.segs.length >= 2 && isShortName(r.segs[0].text) && r.segs[1].text.length > unwrapName(r.segs[0].text).length);

  // 이름이 같은 줄 앞쪽에 되풀이해서 나오는 문서: 이름 위치가 줄마다 달라도(좌우 번갈아 배치 등) 인물로 본다
  const inlineNameCounts = new Map<string, number>();
  for (const r of inlineFirstRows) inlineNameCounts.set(nameKey(r.segs[0].text), (inlineNameCounts.get(nameKey(r.segs[0].text)) ?? 0) + 1);
  const inlineNames = new Set([...inlineNameCounts].filter(([, n]) => n >= 2).map(([name]) => name));
  const inlineLayout = inlineFirstRows.length >= 3 && inlineNames.size > 0;

  const clusters = clusterXs(rows, () => true);
  const minCount = Math.max(2, Math.round(total * 0.02));
  const strong = clusters.filter((c) => c.count >= minCount);
  // 액션 위치: 왼쪽에서 가장 가까우면서 어느 정도 되는 위치. (씬헤딩은 번호 때문에 조금 왼쪽에서 시작하기도 한다)
  const biggest = Math.max(...strong.map((c) => c.count), 1);
  const baseX = (strong.find((c) => c.count >= biggest * 0.25) ?? strong[0] ?? clusters[0]).x;

  const pageWidth = rows.find((r) => r.pageWidth)?.pageWidth;
  const isRight = (x: number) => x >= RIGHT_X || (pageWidth !== undefined && x > baseX + pageWidth * 0.4);

  // 씬헤딩이 모여 있는 위치(지문보다 조금 들여쓴 씬헤딩 등)는 대사 칸이 아니다
  const sceneClusters = strong.filter((c) => c.x > baseX + 8 && c.texts.filter((t) => parseSceneHeading(t)).length >= c.texts.length * 0.6);
  const isSceneX = (x: number) => x <= baseX + 10 || sceneClusters.some((c) => Math.abs(c.x - x) <= CLUSTER_GAP * 1.5);
  const indented = strong.filter((c) => c.x > baseX + 8 && !isRight(c.x) && !sceneClusters.includes(c));

  // 인물 위치: 짧고 같은 이름이 되풀이되는 안쪽 위치
  const candidates = indented
    .map((c) => {
      let score = characterScore(c);
      if (inlineFirstRows.some((r) => Math.abs(r.segs[0].x - c.x) <= CLUSTER_GAP)) score += 0.2;
      return { cluster: c, score };
    })
    .sort((a, b) => b.score - a.score);
  // 인물 이름과 대사가 같은 문단 스타일에 번갈아 쌓이는 문서(구글 문서 등): 위치로는 못 가르니
  // 그 스타일 안에서 짧은 이름이 되풀이되는 것을 인물로 본다
  let stacked: { key: string; names: Set<string> } | null = null;
  const blockKeys = new Set(rows.flatMap((r) => (r.segs.length === 1 && r.segs[0].block ? [r.segs[0].block] : [])));
  for (const key of blockKeys) {
    const texts = rows.filter((r) => r.segs.length === 1 && r.segs[0].block === key).map((r) => r.segs[0].text);
    if (texts.length < 6 || texts.length > rows.length * 0.95 || texts.some((t) => parseSceneHeading(t))) continue;
    const counts = new Map<string, number>();
    for (const t of texts) if (isShortName(t)) counts.set(nameKey(t), (counts.get(nameKey(t)) ?? 0) + 1);
    const names = new Set([...counts].filter(([, n]) => n >= 2).map(([name]) => name));
    const covered = texts.filter((t) => names.has(nameKey(t))).length;
    if (names.size >= 1 && covered >= texts.length * 0.2 && covered <= texts.length * 0.7) {
      stacked = { key, names };
      break;
    }
  }
  let characterCluster: Cluster | null = !stacked && candidates[0] && candidates[0].score > 0.55 ? candidates[0].cluster : null;
  if (answers.characterX !== undefined) {
    // 작가가 알려 준 위치를 따른다
    characterCluster =
      answers.characterX === null ? null : (indented.find((c) => Math.abs(c.x - answers.characterX!) <= CLUSTER_GAP * 1.5) ?? null);
  } else {
    const best = candidates[0]?.score ?? 0;
    const second = candidates[1]?.score ?? 0;
    const unsure = !inlineLayout && !stacked && candidates.length > 0 && (!characterCluster || best < 0.75 || second >= best - 0.12);
    if (unsure && candidates.some((c) => c.score >= 0.3)) {
      questions.push({
        id: "character",
        options: candidates.filter((c) => c.score >= 0.3).slice(0, 3).map((c) => ({
          x: c.cluster.x,
          samples: [...new Set(c.cluster.texts.map((t) => t.slice(0, 14)))].slice(0, 4),
        })),
      });
    }
  }
  // 이름이 액션과 같은 위치에서 시작하고 같은 줄에 대사가 붙는 문서
  const inlineAtBase = !characterCluster && inlineFirstRows.length >= 2;

  const isCharacterX = (x: number) => (characterCluster ? Math.abs(x - characterCluster.x) <= CLUSTER_GAP * 1.5 : false);
  const dialogueClusters = indented.filter((c) => c !== characterCluster);
  const isDialogueX = (x: number) =>
    dialogueClusters.some((c) => Math.abs(c.x - x) <= CLUSTER_GAP * 1.5) ||
    inlineSecond.some((c) => c.count >= 2 && Math.abs(c.x - x) <= CLUSTER_GAP * 1.5 && c.x > baseX + 8);

  // 본문 글꼴(가장 많이 쓰인 글꼴). 다른 글꼴로 쓴 짧은 줄은 서브헤더로 본다.
  const fontChars = new Map<string, number>();
  for (const seg of allSegs) if (seg.font) fontChars.set(seg.font, (fontChars.get(seg.font) ?? 0) + seg.text.length);
  const bodyFont = [...fontChars.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const subheaderSamples: string[] = [];

  // 줄 사이 간격(한 문단 안). 이름과 대사가 한 줄에 있고 액션도 대사와 같은 위치에서 시작하는 문서에서
  // "이어지는 대사"와 "새 액션"을 가르는 데 쓴다.
  const rowGaps: number[] = [];
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    if (prev && prev.page === r.page && r.y > prev.y) rowGaps.push(r.y - prev.y);
  });
  rowGaps.sort((a, b) => a - b);
  const lineStep = rowGaps[Math.floor(rowGaps.length * 0.1)] ?? 0;

  // 글을 읽지 못한 곳: 줄 사이가 갑자기 크게 비었거나, 글이 하나도 없는 쪽 (그림으로 된 글, 읽기 어려운 글꼴 등)
  if (lineStep > 0 && rows.every((r) => !r.paragraph)) {
    let flagged = 0;
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      if (prev && prev.page === r.page && r.y - prev.y > Math.max(lineStep * 4.5, 60) && flagged < 30) {
        flagged++;
        flag("missing-text", r.page, prev.segs.map((sg) => sg.text).join(" "));
      }
    });
    const pagesWithText = new Set(rows.map((r) => r.page));
    const allPages = [...pagesWithText].sort((a, b) => a - b);
    for (let p = allPages[0] + 1; p < allPages[allPages.length - 1]; p++) if (!pagesWithText.has(p)) flag("missing-text", p, "이 쪽에서 읽은 글이 없습니다");
  }

  // ---- 줄마다 역할 정하기 ----
  const items: Item[] = [];
  let prevRole: Role | null = null;
  const push = (role: Role, text: string, row: Row, x: number, sameRow: boolean, right: number, size: number) => {
    items.push({ role, text, page: row.page, y: row.y, x, right, size, paragraph: Boolean(row.paragraph), sameRowAsPrev: sameRow });
    prevRole = role;
  };

  for (const row of rows) {
    let sameRow = false;
    row.segs.forEach((seg, i) => {
      const text = seg.text;
      const rowPos = i === 0 ? "first" : "later";
      let role: Role;
      let continuation = false;
      if (seg.hint) role = seg.hint;
      else if (rowPos === "first" && row.segs.length === 1 && /^INS\s*[.>＞》]/i.test(text)) role = "subheader";
      else if (rowPos === "first" && row.segs.length === 1 && text.length <= 40 && SUBHEADER_TEXT.test(text)) role = "subheader";
      else if (rowPos === "first" && !isDialogueX(seg.x) && !isCharacterX(seg.x) && parseSceneHeading(text) && isSceneX(seg.x)) role = "scene";
      else if (isRight(seg.x) && text.length <= 30) role = "transition";
      else if (TRANSITION.test(text) && text.length <= 24 && !isDialogueX(seg.x) && seg.x <= baseX + 10 && /[A-Z가-힣]/.test(text) && (/^(FADE|CUT|DISSOLVE|SMASH|MATCH|WIPE|F\.|O\.?\s*L|W\.?\s*[IO]|DIS|오버랩|화이트|블랙)/i.test(text) || /^(페이드|컷|디졸브|암전)/.test(text))) role = "transition";
      else if (rowPos === "later") role = isParenthetical(text) && text.length <= 30 ? "parenthetical" : "dialogue";
      else if (stacked && rowPos === "first" && row.segs.length === 1 && seg.block === stacked.key) {
        if (stacked.names.has(nameKey(text))) role = "character";
        else role = isParenthetical(text) && text.length <= 30 ? "parenthetical" : "dialogue";
      }
      else if (inlineLayout && rowPos === "first" && row.segs.length >= 2 && inlineNames.has(nameKey(text)) && row.segs[1].text.length >= unwrapName(text).length) role = "character";
      else if (inlineLayout && row.paragraph && rowPos === "first" && row.segs.length === 1 && prevRole === "dialogue" && !sameRow && seg.x > baseX + 8 && !isParenthetical(text)) {
        role = "dialogue";
        continuation = true;
      }
      else if (isCharacterX(seg.x) && isShortName(text) && !(isParenthetical(text) && (prevRole === "character" || prevRole === "parenthetical"))) role = "character";
      else if (inlineAtBase && row.segs.length >= 2 && isShortName(text) && Math.abs(seg.x - baseX) <= CLUSTER_GAP * 2 && row.segs[1].text.length >= unwrapName(text).length) role = "character";
      else if ((prevRole === "character" || prevRole === "parenthetical") && seg.x > baseX + 8) role = isParenthetical(text) && text.length <= 30 ? "parenthetical" : "dialogue";
      else if (rowPos === "first" && !seg.hint && bodyFont && seg.font && seg.font !== bodyFont && seg.x <= baseX + 10 && text.length <= 40 && row.segs.length === 1 && !isParenthetical(text)) {
        subheaderSamples.push(text);
        role = answers.lineStyles?.[text] ?? "subheader";
      }
      else if (isDialogueX(seg.x) || isCharacterX(seg.x)) role = isParenthetical(text) && text.length <= 30 ? "parenthetical" : "dialogue";
      else role = "action";

      // "목소리 (O.S)"처럼 같은 줄 뒤쪽에 붙은 괄호 표시는 인물 이름에 붙인다
      const lastItem = items[items.length - 1];
      if (rowPos === "later" && !seg.hint && lastItem && lastItem.role === "character" && sameRow && isParenthetical(text) && text.length <= 16) {
        lastItem.text = `${lastItem.text} ${text}`;
        return;
      }
      // 인물 이름 끝의 (CONT'D) 떼기
      // "형사 1"과 "형사1"은 같은 인물이다 (뒤 숫자 앞 띄어쓰기를 없앤다)
      const clean = role === "character" ? unwrapName(text.replace(CONTD, "").trim()).replace(/^([^\s\d]+)\s+(\d{1,2})(?=\s*(?:\(|$))/, "$1$2") : text;

      // 이름 옆에 대사가 붙는 문서: 대사 위치에서 시작해도 앞 줄과 간격이 벌어졌으면 새 액션이다
      const lastRow = items[items.length - 1];
      if (inlineAtBase && rowPos === "first" && !seg.hint && role === "dialogue" && lastRow && lineStep > 0 && (lastRow.page === row.page ? row.y - lastRow.y > lineStep * 1.35 : terminal(lastRow.text))) {
        role = "action";
      }

      // 앞에 인물이 없는 대사·괄호지문은 액션으로 본다
      if ((role === "dialogue" || role === "parenthetical") && prevRole !== "character" && prevRole !== "dialogue" && prevRole !== "parenthetical") {
        if (!inlineAtBase) flag("orphan-dialogue", row.page, text);
        role = "action";
      }
      push(role, clean, row, seg.x, sameRow, seg.right ?? seg.x, seg.size ?? 11);
      if (continuation) items[items.length - 1].cont = true;
      sameRow = true;
    });
  }

  if (subheaderSamples.length > 0 && answers.lineStyles === undefined) {
    questions.push({ id: "subheader", samples: [...new Set(subheaderSamples)].slice(0, 10) });
  }

  // 대사가 이어지지 않는 인물 이름은 액션으로
  for (let i = 0; i < items.length; i++) {
    if (items[i].role !== "character") continue;
    const next = items[i + 1];
    if (!next || (next.role !== "dialogue" && next.role !== "parenthetical")) {
      flag("lonely-name", items[i].page, items[i].text);
      items[i] = { ...items[i], role: "action" };
    }
  }

  // ---- 문단 이어 붙이기 ----
  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].paragraph || rows[i].page !== rows[i - 1].page) continue;
    const g = rows[i].y - rows[i - 1].y;
    if (g > 0.5) gaps.push(Math.round(g * 2) / 2);
  }
  const step = mode(gaps) ?? 0;
  const joinLimit = step > 0 ? step * 1.45 : 0;

  // 줄이 끝까지 찼는지: 같은 자리 줄들 가운데 거의 가장 오른쪽까지 간 줄이 "찬 줄"이다.
  // 찬 줄 다음에 이어지는 줄은 같은 문단이고, 덜 찬 줄에서 끊긴 것은 작가가 줄을 바꾼 것이다.
  const rights = new Map<string, number[]>();
  const rightKey = (role: Role, x: number) => `${role}|${Math.round(x / 8)}`;
  for (const it of items) {
    if (it.paragraph || it.right <= it.x) continue;
    const key = rightKey(it.role, it.x);
    if (!rights.has(key)) rights.set(key, []);
    rights.get(key)!.push(it.right);
  }
  const fullLine = (role: Role, x: number, right: number, nextWord: number) => {
    const list = rights.get(rightKey(role, x));
    if (!list || list.length < 4 || right <= x) return true; // 판단할 자료가 없으면 이어 붙인다
    const sorted = [...list].sort((a, b) => a - b);
    const edge = sorted[Math.floor(sorted.length * 0.9)];
    // 남은 자리가 다음 줄 첫 단어보다 좁으면 그 단어가 넘어간 것이다 (같은 문단)
    return edge - right < nextWord + FULL_LINE_SLACK;
  };

  type Out = { role: Role; text: string; page: number; y: number; x: number; paragraph: boolean; right: number };
  const merged: Out[] = [];
  for (const it of items) {
    const last = merged[merged.length - 1];
    if (it.cont && last && last.role === "dialogue") {
      last.text = `${last.text} ${it.text}`;
      continue;
    }
    const joinable =
      last &&
      !it.paragraph &&
      !last.paragraph &&
      (it.role === "action" || it.role === "dialogue") &&
      last.role === it.role &&
      !it.sameRowAsPrev &&
      Math.abs(last.x - it.x) <= CLUSTER_GAP * 1.5 &&
      fullLine(last.role, last.x, last.right, firstWordWidth(it.text, it.size)) &&
      (it.page === last.page ? joinLimit > 0 && it.y - last.y <= joinLimit : !terminal(last.text));
    if (joinable) {
      last.text = `${last.text} ${it.text}`;
      last.y = it.y;
      last.page = it.page;
      last.right = it.right;
    } else merged.push({ role: it.role, text: it.text, page: it.page, y: it.y, x: it.x, paragraph: it.paragraph, right: it.right });
  }

  // ---- 마무리: 대사 앞 (괄호), 씬헤딩 정리 ----
  const lines: ImportedScript["lines"] = [];
  const characters = new Set<string>();
  const nameCount = new Map<string, number>();
  const namePage = new Map<string, number>();
  let scenes = 0;
  let dialogues = 0;
  let actions = 0;
  for (const m of merged) {
    if (m.role === "scene") {
      const heading = parseSceneHeading(m.text) ?? m.text;
      lines.push({ style: "scene", text: heading });
      scenes++;
    } else if (m.role === "dialogue") {
      const lead = /^([(（][^)）]{1,30}[)）])\s*(.+)$/.exec(m.text);
      if (lead) {
        lines.push({ style: "parenthetical", text: lead[1] });
        lines.push({ style: "dialogue", text: lead[2] });
      } else lines.push({ style: "dialogue", text: m.text });
      dialogues++;
    } else if (m.role === "character") {
      lines.push({ style: "character", text: m.text });
      const key = nameKey(m.text);
      nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
      if (!namePage.has(key)) namePage.set(key, m.page);
      // "홍, 진", "준우/사내"처럼 둘이 함께 말하는 이름은 사람마다 따로 센다
      const together = key.split(/\s*[,，/·&]\s*/).filter((n) => n && n.length <= 10);
      for (const person of together.length > 1 ? together : [key]) characters.add(person);
    } else {
      lines.push({ style: m.role, text: m.text });
      if (m.role === "action") actions++;
    }
  }

  // 한 번만 나온 이름은 인물이 아닐 수 있다 (인물이 여럿인 원고에서만 알려 준다)
  if (nameCount.size >= 4) {
    let n = 0;
    for (const [key, count] of nameCount) if (count === 1 && !/[,，/·&]/.test(key) && n++ < 20) flag("single-name", namePage.get(key) ?? 1, key);
  }
  if (scenes === 0) flag("no-scene", 1, "");
  if (characters.size === 0 && scenes > 0) flag("no-character", 1, "");

  const report: ImportReport = { scenes, characters: [...characters], dialogues, actions, review, removed: cleaned.removed };
  return { title, lines, report, questions };
}

/** 글의 첫 단어가 차지할 너비 (pt). 한글·한자는 글자 크기만큼, 영문·숫자는 절반쯤 */
function firstWordWidth(text: string, size: number): number {
  const word = text.split(/\s/)[0] ?? "";
  let width = 0;
  for (const ch of word) width += (ch.codePointAt(0) ?? 0) > 0x2e7f ? size : size * 0.55;
  return width;
}

function mode(values: number[]): number | null {
  if (values.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // 가장 흔한 간격이 문단 안의 줄 간격이다. (문단 사이 간격은 더 드물다)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

export { CENTER_X, RIGHT_X };
