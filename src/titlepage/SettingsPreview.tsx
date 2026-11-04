import { PAGE, type OutlinePrint } from "../layout/paginate";
import { WATERMARK } from "../project/scriptSettings";
import { coverLines, PREVIEW_HEIGHT, PREVIEW_WIDTH, sampleBody, watermarkMarks, type PreviewLine } from "./previewLayout";
import type { CoverField, TitlePageFields } from "./titlePage";

const LEFT = PAGE.leftMarginIn * 72;
const TOP = PAGE.topMarginIn * 72;
const COLUMN = PAGE.columnIn * 72;
const SIZE = PAGE.fontSizePt;
const LINE = PAGE.lineHeightPt;
/** 한 줄 맨 위에서 글자 기준선까지 (src/pdf/buildPdf.ts의 BASELINE과 같다) */
const BASELINE = (LINE - SIZE) / 2 + 9.5;

function Lines({ lines }: { lines: PreviewLine[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <text
          key={i}
          x={LEFT + line.column * COLUMN}
          y={TOP + line.row * LINE + BASELINE}
          fontSize={SIZE * (line.scale ?? 1)}
          fontWeight={line.bold ? 700 : 400}
          fill={line.gray ? "#8e8e93" : undefined}
          textAnchor={line.align === "center" ? "middle" : line.align === "end" ? "end" : "start"}
        >
          {line.text}
        </text>
      ))}
    </>
  );
}

function Watermark({ text }: { text: string }) {
  const { marks, text: clean } = watermarkMarks(text);
  return (
    <g opacity={WATERMARK.opacity} aria-hidden="true">
      {marks.map((m, i) => (
        <text
          key={i}
          transform={`translate(${m.x} ${m.y}) rotate(${-WATERMARK.angle})`}
          fontSize={m.size}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {clean}
        </text>
      ))}
    </g>
  );
}

function Page({ label, lines, watermark, empty }: { label: string; lines: PreviewLine[]; watermark: string; empty?: string }) {
  return (
    <figure className="settings-preview-page">
      <svg viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`} role="img" aria-label={`${label} 미리보기`}>
        <rect width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} fill="#fff" />
        <g fill="#1d1d1f" fontFamily='"Courier Prime", "Nanum Gothic Coding", monospace'>
          <Lines lines={lines} />
          {empty && (
            <text x={PREVIEW_WIDTH / 2} y={PREVIEW_HEIGHT / 2} fontSize={SIZE * 1.1} textAnchor="middle" fill="#8e8e93">
              {empty}
            </text>
          )}
          <Watermark text={watermark} />
        </g>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/**
 * 스크립트 설정 창 오른쪽의 미니 페이지. 표지 탭에서는 표지가 어떻게 나오는지,
 * 스크립트 설정 탭에서는 본문에 워터마크가 어떻게 찍히는지 한 장만 크게 보여 준다.
 */
export function SettingsPreview({
  tab,
  fields,
  off,
  watermark,
  print,
}: {
  tab: "cover" | "script";
  fields: TitlePageFields;
  off: ReadonlySet<CoverField>;
  watermark: string;
  /** 막·장·요약을 넣기로 했는지 (본문 예시 쪽에 그대로 보인다) */
  print: OutlinePrint;
}) {
  const cover = coverLines(fields, off);
  return (
    <aside className="settings-preview" aria-label="미리보기">
      {tab === "cover" ? (
        <Page label="표지" lines={cover} watermark={watermark} empty={cover.length === 0 ? "표지 없음" : undefined} />
      ) : (
        <Page label="본문 (예시)" lines={sampleBody(print)} watermark={watermark} />
      )}
    </aside>
  );
}
