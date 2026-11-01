// 앱에 들어가는 오픈소스(npm 운영 의존성 + Rust 크레이트)의 라이선스 전문을 모아
// public/licenses/THIRD-PARTY-LICENSES.txt 로 만든다. 의존성을 바꾼 뒤 다시 실행한다:
//   node scripts/gen-licenses.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/** 폴더 안의 LICENSE / LICENCE / COPYING 계열 파일 글 */
function licenseTexts(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^(licen[sc]e|copying|notice)([-_.].*)?$/i.test(f) && !/\.(js|mjs|ts|json|d\.ts)$/i.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8").trim())
    .filter(Boolean);
}

const entries = []; // { name, version, license, repo, texts }

// ---- npm: 운영 의존성과 그 하위 의존성 ----
const seen = new Set();
function visit(name, from) {
  let dir = from;
  let found = null;
  while (dir.length >= root.length) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) { found = candidate; break; }
    dir = dirname(dir);
  }
  if (!found || seen.has(found)) return;
  seen.add(found);
  const p = JSON.parse(readFileSync(join(found, "package.json"), "utf8"));
  const repo = typeof p.repository === "string" ? p.repository : p.repository?.url ?? p.homepage ?? "";
  entries.push({ name: p.name, version: p.version, license: typeof p.license === "string" ? p.license : p.license?.type ?? JSON.stringify(p.licenses ?? "알 수 없음"), repo: repo.replace(/^git\+/, "").replace(/\.git$/, ""), texts: licenseTexts(found) });
  for (const dep of Object.keys(p.dependencies ?? {})) visit(dep, found);
}
for (const dep of Object.keys(pkg.dependencies)) visit(dep, root);

// ---- Rust: 앱에 들어가는 크레이트 ----
const meta = JSON.parse(
  execFileSync("cargo", ["metadata", "--format-version", "1", "--manifest-path", join(root, "src-tauri/Cargo.toml"), "--filter-platform", "aarch64-apple-darwin"], { maxBuffer: 1 << 28, encoding: "utf8" }),
);
const resolved = new Set(
  meta.resolve.nodes
    .filter((n) => n.deps.length >= 0)
    .map((n) => n.id),
);
const normal = new Set();
const byId = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
const stack = [meta.resolve.root];
while (stack.length) {
  const id = stack.pop();
  if (normal.has(id)) continue;
  normal.add(id);
  for (const d of byId.get(id)?.deps ?? []) if (d.dep_kinds.some((k) => k.kind === null || k.kind === "build")) stack.push(d.pkg);
}
for (const p of meta.packages) {
  if (!normal.has(p.id) || p.name === "dropkick" || !resolved.has(p.id)) continue;
  entries.push({ name: p.name, version: p.version, license: p.license ?? p.license_file ?? "알 수 없음", repo: p.repository ?? "", texts: licenseTexts(dirname(p.manifest_path)) });
}

// ---- 저작권자 줄까지 똑같은 전문만 한 번으로 묶는다 ----
const groups = new Map(); // hash -> { text, pkgs[] }
const missing = [];
for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
  if (e.texts.length === 0) { missing.push(e); continue; }
  for (const text of e.texts) {
    const key = createHash("sha1").update(text.replace(/\s+/g, " ")).digest("hex") + e.license;
    if (!groups.has(key)) groups.set(key, { text, pkgs: [] });
    groups.get(key).pkgs.push(e);
  }
}

let out = "DropKick에 들어 있는 오픈소스 라이선스\n";
out += "DropKick은 MIT 라이선스(LICENSE)입니다. 아래는 앱에 함께 들어가는 오픈소스와 각각의 라이선스 전문입니다.\n";
out += "글꼴(Courier Prime, 나눔고딕코딩)의 라이선스는 fonts/OFL-*.txt 에 있습니다.\n";
out += "이 파일은 scripts/gen-licenses.mjs 로 만듭니다.\n\n";
out += "==== 목록 ====\n";
for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) out += `${e.name} ${e.version} — ${e.license}${e.repo ? ` — ${e.repo}` : ""}\n`;
out += "\n";
for (const { text, pkgs } of groups.values()) {
  out += "=".repeat(70) + "\n";
  out += pkgs.map((p) => `${p.name} ${p.version}`).filter((v, i, a) => a.indexOf(v) === i).join(", ") + "\n";
  out += "=".repeat(70) + "\n" + text + "\n\n";
}
if (missing.length) out += `(라이선스 파일이 따로 없는 항목: ${missing.map((m) => `${m.name} (${m.license})`).join(", ")} — 위 목록의 라이선스 이름을 따르며, 저장소 주소에서 원문을 볼 수 있습니다. MPL-2.0 항목(selectors)의 소스 코드도 그 주소에서 받을 수 있습니다)\n`;

mkdirSync(join(root, "public/licenses"), { recursive: true });
writeFileSync(join(root, "public/licenses/THIRD-PARTY-LICENSES.txt"), out);
console.log(`항목 ${entries.length}개, 전문 ${groups.size}종, 파일 없음 ${missing.length}개, ${(out.length / 1024).toFixed(0)}KB`);
if (missing.length) console.log("파일 없음:", missing.map((m) => `${m.name}(${m.license})`).join(", "));
