// 자동 업데이트용 latest.json 만들기
// node scripts/make-latest-json.mjs <버전> <서명 파일> <업데이트 파일 이름> <릴리스 노트 파일> <출력 파일>
import { readFileSync, writeFileSync } from "node:fs";

const [version, sigFile, assetName, notesFile, outFile] = process.argv.slice(2);
const url = `https://github.com/gotgam100/DropKick_releases/releases/download/v${version}/${assetName}`;
const signature = readFileSync(sigFile, "utf8").trim();
const platform = { signature, url };
const manifest = {
  version,
  notes: readFileSync(notesFile, "utf8").trim(),
  pub_date: new Date().toISOString(),
  // 유니버설 앱 하나로 Apple Silicon과 인텔 맥 모두에 쓴다.
  platforms: {
    "darwin-aarch64": platform,
    "darwin-x86_64": platform,
    "darwin-universal": platform,
  },
};
writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`latest.json: ${version} → ${url}`);
