// pdf.js(옛 브라우저용 legacy판: macOS 13의 Safari에서도 돌아가게)가 글자를 읽을 때 쓰는 작업 파일의 주소 (PDF를 가져올 때만 불러온다)
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export default workerUrl;
