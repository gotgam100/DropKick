/**
 * 작성 가이드 2쪽: 이야기 구조. 막 · 시퀀스 · 씬 요약을 만드는 법과 쓰임만 보여 준다.
 * (글자 꾸미기·정렬은 워드프로세서와 같고 우클릭 "글자 모양"에 있어서 가이드에 넣지 않는다)
 * 열: 화면(원고에서 보이는 모양) · 치는 법 · 설명
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

type Row = { form: ReactNode; type: ReactNode; note: ReactNode };

const ROWS: Row[] = [
  {
    form: <strong className="guide-structure-act">막</strong>,
    type: <code># </code>,
    note: "이야기를 크게 나눠요. 줄 맨 앞에서 # 와 띄어쓰기",
  },
  {
    form: <strong className="guide-structure-chapter">시퀀스</strong>,
    type: <code>## </code>,
    note: "막 안에서 씬을 한 번 더 묶어요. 줄 맨 앞에서 ## 와 띄어쓰기",
  },
  {
    form: <span className="guide-structure-synopsis">씬 요약</span>,
    type: <code>= </code>,
    note: "이 씬에서 일어날 일을 적어 둬요. 씬헤딩 바로 아래 줄에서 = 와 띄어쓰기",
  },
];

export function GuideStructurePage() {
  return (
    <div className="guide-quick guide-symbols">
      <section className="guide-sym-block">
        <p className="guide-structure-lead">
          막 · 시퀀스 · 씬 요약은 <strong>인쇄되지 않는 메모 줄</strong>이에요. 원고 사이에 적어 두면 사이드바 씬 목록이
          막 ▾ 시퀀스 ▾ 씬 ▾ 요약으로 묶여서, 이야기 전체 흐름을 접고 펼치며 볼 수 있어요.
        </p>
        <table className="guide-sym-table">
          <thead>
            <tr>
              <th>화면</th>
              <th>치는 법</th>
              <th>설명</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={i}>
                <td>{r.form}</td>
                <td>{r.type}</td>
                <td>{r.note}</td>
              </tr>
            ))}
            <tr className="guide-sym-demo-row">
              <td colSpan={3}>
                <GuideOutlineDemo />
              </td>
            </tr>
          </tbody>
        </table>
        <ul className="guide-structure-tips">
          <li>PDF·Word에도 넣고 싶으면 스크립트 설정 → "내보낼 때"에서 "막·시퀀스 제목 넣기", "씬 요약 넣기"를 켜세요.</li>
        </ul>
        <p className="guide-sym-tip">
          이 기호들은 시나리오 파일 형식인 Fountain의 규칙을 따라요. 참고:{" "}
          <a href={FOUNTAIN_URL} onClick={openFountainSite}>
            {FOUNTAIN_URL}
          </a>
        </p>
      </section>
    </div>
  );
}
