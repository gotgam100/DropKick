import { EditorState } from "@codemirror/state";

/** 찾기·바꾸기 창의 글을 한국어로 보이게 한다. (CodeMirror 기본 문구는 영어) */
export const koreanSearchPhrases = EditorState.phrases.of({
  Find: "찾을 글",
  Replace: "바꿀 글",
  next: "다음",
  previous: "이전",
  all: "모두 선택",
  "match case": "대소문자 구분",
  regexp: "정규식",
  "by word": "단어 단위",
  replace: "바꾸기",
  "replace all": "모두 바꾸기",
  close: "닫기",
  "current match": "현재 위치",
  "on line": "줄",
  "replaced $ matches": "$곳을 바꿨습니다",
  "replaced match on line $": "$번째 줄을 바꿨습니다",
});
