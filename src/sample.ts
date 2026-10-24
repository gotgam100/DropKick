import type { ScriptLine } from "./editor/lineStyles";

// 앱을 처음 열었을 때 보여 주는 짧은 예시 원고
export const SAMPLE_SCRIPT: ScriptLine[] = [
  { style: "transition", text: "FADE IN:" },
  { style: "scene", text: "S#1. 내부. 동네 체육관 - 밤" },
  {
    style: "action",
    text: "형광등 하나가 깜빡인다. 낡은 링 위에 민재(30대)가 혼자 서 있다. 땀에 젖은 붕대가 손목에서 풀려 내려온다.",
  },
  { style: "character", text: "민재" },
  { style: "parenthetical", text: "(숨을 고르며)" },
  { style: "dialogue", text: "딱 한 번만 더." },
  { style: "action", text: "민재, 로프를 박차고 뛰어오른다." },
  { style: "transition", text: "CUT TO:" },
  { style: "scene", text: "S#2. 외부. 체육관 앞 골목 - 밤" },
  { style: "action", text: "비가 내린다. 수아(20대)가 우산도 없이 체육관 간판을 올려다본다." },
  { style: "character", text: "수아" },
  { style: "dialogue", text: "여기구나. 간판 불은 아직 켜져 있네." },
  { style: "action", text: "체육관 안에서 쿵, 하고 무언가 떨어지는 소리." },
  { style: "character", text: "민재 (V.O.)" },
  { style: "dialogue", text: "문 열려 있어요. 들어와요." },
];
