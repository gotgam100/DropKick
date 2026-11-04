/**
 * 작성 가이드 2쪽: Fountain 규칙. 드롭킥 원고에서 실제로 쓸 수 있는 기호만 보여 준다.
 * 열: 화면(원고에서 보이는 모양) · 규칙 및 단축키(치는 법이나 단축키) · 설명
 */
import type { ReactNode } from "react";
import { GuideOutlineDemo } from "./GuideOutlineDemo";
import { isTauri } from "@tauri-apps/api/core";

const FOUNTAIN_URL = "https://fountain.io/syntax/";

/** 앱에서는 기본 브라우저로 열고, 웹 미리보기에서는 새 탭으로 연다. */
async function openFountainSite(e: React.MouseEvent) {
  e.preventDefault();
  try {
    if (isTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(FOUNTAIN_URL);
    } else window.open(FOUNTAIN_URL, "_blank", "noreferrer");
  } catch {
    /* 열지 못해도 글에 주소가 보이니 괜찮다 */
  }
}

type Row = {
  form: ReactNode;
  keys: ReactNode;
  note: ReactNode;
  demo?: boolean;
};

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="guide-kbd">{children}</kbd>
);

const ROWS: Row[] = [
  {
    form: <code>실내. 장소명 - 시간대</code>,
    keys: <Kbd>⌘1</Kbd>,
    note: "모양이 다르면 물결 밑줄 표시",
  },
  {
    form: <strong>막</strong>,
    keys: <Kbd>#</Kbd>,
    note: "줄 맨 앞에서 # 와 띄어쓰기",
  },
  {
    form: <strong>시퀀스</strong>,
    keys: <Kbd>##</Kbd>,
    note: "줄 맨 앞에서 ## 와 띄어쓰기",
  },
  {
    form: <strong>씬 요약</strong>,
    keys: <Kbd>=</Kbd>,
    note: "씬헤딩 바로 아래 줄에서 = 와 띄어쓰기",
  },
  { form: null, keys: null, note: null, demo: true },
  {
    form: <span className="cm-em-b">굵게</span>,
    keys: (
      <>
        <code>**굵게**</code> 또는 <Kbd>⌘B</Kbd>
      </>
    ),
    note: "글씨를 볼드 처리",
  },
  {
    form: <span className="cm-em-i">기울임</span>,
    keys: (
      <>
        <code>*기울임*</code> 또는 <Kbd>⌘I</Kbd>
      </>
    ),
    note: "글씨를 기울임 처리",
  },
  {
    form: <span className="cm-em-u">밑줄</span>,
    keys: (
      <>
        <code>_밑줄_</code> 또는 <Kbd>⌘U</Kbd>
      </>
    ),
    note: "글씨에 밑줄",
  },
  {
    form: <span className="cm-em-b cm-em-i">굵은 기울임</span>,
    keys: <code>***굵은 기울임***</code>,
    note: "굵게·기울임·밑줄은 한꺼번에 겹쳐 쓸 수 있음",
  },
  {
    form: <span className="guide-center-demo">끝</span>,
    keys: (
      <>
        <code>&gt;끝&lt;</code> 또는 <Kbd>⌘E</Kbd>
      </>
    ),
    note: "액션 줄을 가운데 정렬",
  },
  {
    form: <span>네 칸 들여쓰기</span>,
    keys: (
      <>
        <Kbd>⌘]</Kbd> <Kbd>⌘[</Kbd>
      </>
    ),
    note: "액션 줄 들여쓰기 · 내어쓰기",
  },
];

export function GuideSymbolsPage() {
  return (
    <div className="guide-quick guide-symbols">
      <section className="guide-sym-block">
        <table className="guide-sym-table">
          <thead>
            <tr>
              <th>화면</th>
              <th>규칙 및 단축키</th>
              <th>설명</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) =>
              r.demo ? (
                <tr key={i} className="guide-sym-demo-row">
                  <td colSpan={3}>
                    <GuideOutlineDemo />
                  </td>
                </tr>
              ) : (
                <tr key={i}>
                  <td>{r.form}</td>
                  <td>{r.keys}</td>
                  <td>{r.note}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        <p className="guide-sym-tip">
          굵게·기울임·밑줄·정렬·들여쓰기는 원고를 드래그하고 우클릭 → "글자
          모양"에서도 고를 수 있습니다. 짝이 없는 별표(*)와 밑줄(_)은 그대로
          보이고 인쇄됩니다. 짝이 맞는데도 글자 그대로 쓰려면 앞에 \를 붙이세요
          (<code>\*</code>, <code>\_</code>).
        </p>
        <p className="guide-sym-tip">
          드롭킥은 Fountain 규칙의 일부를 사용하고, 그 위에 드롭킥만의 규칙을
          더했습니다. 참고:{" "}
          <a href={FOUNTAIN_URL} onClick={openFountainSite}>
            {FOUNTAIN_URL}
          </a>
        </p>
      </section>
    </div>
  );
}
