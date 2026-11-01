/**
 * PDF·Word·한글(hwpx) 시나리오를 읽어 DropKick 줄들로 바꾼다. (AI 없이, 글자 위치와 모양으로 판단한다)
 * 무거운 pdf.js는 PDF를 고를 때만 불러온다.
 */
import { classifyRows } from "./classify";
import { extractDocxRows } from "./docxRows";
import { extractHwpxRows } from "./hwpxRows";
import type { Answers, ImportedScript, Question, Row } from "./types";

export type DocumentKind = "pdf" | "docx" | "hwpx";

export function documentKind(path: string): DocumentKind | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".hwpx")) return "hwpx";
  return null;
}

/** 글자 위치 읽기만 하는 단계 (PDF는 pdf.js, Word는 문서 안의 문단) */
export async function readDocumentRows(kind: DocumentKind, data: Uint8Array): Promise<Row[]> {
  if (kind === "docx") return extractDocxRows(data);
  if (kind === "hwpx") return extractHwpxRows(data);
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("./pdfWorker")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const { extractPdfRows } = await import("./pdfRows");
  return extractPdfRows(data, pdfjs as never);
}

/**
 * 문서를 읽어 DropKick 줄들로 바꾼다.
 * 확실하지 않은 부분이 있으면 ask로 작가에게 물어보고, 받은 답으로 다시 분석한다.
 * ask가 null을 돌려주면(취소) null을 돌려준다.
 */
export async function importDocumentBytes(
  kind: DocumentKind,
  data: Uint8Array,
  ask?: (questions: Question[]) => Promise<Answers | null>,
): Promise<ImportedScript | null> {
  const rows = await readDocumentRows(kind, data);
  const first = classifyRows(rows);
  if (!ask || first.questions.length === 0) return first;
  const answers = await ask(first.questions);
  if (answers === null) return null;
  return classifyRows(rows, answers);
}
