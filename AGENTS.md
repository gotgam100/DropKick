# AGENTS.md — DropKick 작업 안내 (AI 코딩 도구용)

이 파일은 이 저장소에서 일하는 AI(제미나이, Claude 등)가 **가장 먼저 읽는 안내서**다.
자세한 결정 기록은 `PLAN.md`, 배포 절차는 `docs/RELEASE.md`, 실행 방법은 `README.md`에 있다.

## 1. 어떤 앱인가

- **DropKick**: 맥용 한글 시나리오 작성 앱. 할리우드 형식(들여쓰기 블록, 인물 이름·대사 위치 고정)으로 쓴다.
- 혼자 개발하는 개인 프로젝트. 사용자는 시나리오 작가이며 **개발자가 아니다**. 설명은 쉬운 한국어로 한다.
- 기술: **Tauri 2** (Rust) + **Vite + React + TypeScript** + **CodeMirror 6**. 라이선스 MIT.
- 앱 식별자 `com.baekmac.dropkick`, 최소 macOS 13, 유니버설 빌드(Apple Silicon + 인텔).
- 저장소
  - 코드: `gotgam100/DropKick` (**비공개**, `main` 브랜치에서 바로 작업)
  - 배포 전용: `gotgam100/DropKick_releases` (**공개**, README와 릴리즈 파일만. 코드는 절대 올리지 않는다)

## 2. 명령어

```bash
source ~/.cargo/env   # 터미널에서 cargo를 못 찾을 때 먼저
npm install
npm run tauri dev     # 개발용 앱 실행 (Rust 코드를 고치면 자동으로 다시 켜진다)
npm test              # vitest. 현재 109개, 모두 통과해야 한다
npx tsc --noEmit      # 타입 검사
(cd src-tauri && cargo build)   # Rust만 빌드
```

배포는 `scripts/release.sh` (아래 7장). **사용자가 요청할 때만** 실행한다.

## 3. 폴더 구조

| 위치 | 내용 |
|---|---|
| `src/editor/` | 원고 편집기. `styles.ts`(6가지 줄 스타일), `lineStyles.ts`(줄마다 스타일 저장, 실행 취소, 씬 번호, 인물 이름 일괄 바꾸기), `scriptView.ts`(화면 꾸미기, 단축키, 인물 이름 자동 완성), `pageBreaks.ts`(화면 속 페이지 나눔), `Editor.tsx`, `TextEditor.tsx`(일반 문서, Markdown), `ScriptPreview.tsx`(읽기 전용) |
| `src/layout/` | **페이지 계산의 기준.** `metrics.ts`(글자 폭, 줄 바꿈), `paginate.ts`(페이지 나누기), `sceneNumbers.ts` |
| `src/pdf/` | PDF 만들기 (pdf-lib). 화면과 같은 페이지 계산을 쓴다 |
| `src/docx/` | Word(.docx) 만들기 (docx, MIT). 할리우드 표준 들여쓰기와 표지 포함 |
| `src/fountain/` | Fountain 형식 읽기/쓰기 |
| `src/analysis/` | 통계(페이지, 러닝타임, 인물별 대사량, 씬 길이) |
| `src/project/` | 프로젝트 모델(`model.ts`), 트리 편집(`tree.ts`), 저장/불러오기(`projectIO.ts`, `tauriFs.ts`), 전체 상태(`useProject.ts`: 자동 저장, 복구, 백업, 메뉴 처리) |
| `src/panels/` | 왼쪽 프로젝트 트리, 찾기, 오른쪽 통계, 인물 이름 바꾸기 창 |
| `src/revisions/` | 수정고(1고, 2고…) 보관·비교·되돌리기 |
| `src/titlepage/` | 표지 |
| `src/update/` | 자동 업데이트 확인 |
| `src-tauri/src/lib.rs` | Rust 명령(파일 읽기/쓰기, 휴지통, 백업 정리 등), 메뉴, `.dropkick` 열기 |
| `samples/` | 테스트용 한글 원고 (`short-5p.fountain`, `long-100p.fountain`) |
| `design/` | 앱 아이콘 원본 (`app-icon-1024.png` → `npx tauri icon`으로 `src-tauri/icons` 생성, 생성 후 `android/`, `ios/` 폴더는 지운다) |

## 4. 꼭 지켜야 할 규칙

### 원고 형식
- 줄 스타일 6가지: 씬헤딩, 액션(지문), 인물, 괄호지문, 대사, 전환. 단축키 ⌘1–⌘6.
- 인물 이름 앞에 `@` 같은 기호를 **화면에 보이지 않는다** (Fountain 파일에만 쓴다).
- 액션 다음 액션은 빈 줄 없이 붙는다. 씬 번호(S#1, S#2…)는 자동으로 매긴다.
- Fountain 저장: 빈 씬헤딩은 `.`, 빈 전환은 `>`로 써서 스타일을 잃지 않게 한다.

### 화면 = PDF (가장 중요)
- **화면의 페이지와 PDF의 페이지는 줄 바꿈까지 똑같아야 한다.** 둘 다 `src/layout/`의 계산을 쓴다.
- US Letter, 줄 간격 **1.3배 → 한 페이지 41줄**. 러닝타임 계산만 표준 54줄(1페이지 ≈ 1분) 기준.
- 글꼴: Courier Prime(영문) + 나눔고딕코딩(한글), 둘 다 OFL. 한글은 11pt(`KOREAN_SCALE = 11/12`), CSS는 `size-adjust: 91.6667%`.
- CSS `--line: 20.796875px`는 1/64px 단위로 맞춘 값이다. 반올림하면 페이지가 길어질수록 어긋난다.
- 한글은 단어 중간에서 줄을 바꾸지 않는다(keep-all). 줄 끝 공백 규칙은 `metrics.ts`의 `wrapText`에 있다.
- 페이지는 문단 사이에서만 나눈다. 대사가 넘어가면 `(MORE)` / `(CONT'D)`.
- 페이지 번호는 1페이지부터 모든 페이지에 찍는다.
- 이 부분을 고치면 `npm test`(특히 `samples.test.ts`, `paginate.test.ts`, `buildPdf.test.ts`)를 반드시 돌리고, 개발용 앱에서 화면과 PDF를 직접 비교한다.

### 프로젝트 파일
- 원고는 항상 **프로젝트 단위**. `제목.dropkick/` 폴더(Finder에서는 파일 하나로 보임) 안에:
  - `project.json` (format `"dropkick-project"`, version 1, 트리, 수정고 목록)
  - 트리 모양 그대로 저장된 파일들 (`스크립트.fountain`, `인물 설정/민재.md` …)
  - `.dropkick-backups/<시각>/` 백업 (최근 30개), `.dropkick-revisions/<이름>/` 수정고
- 새 프로젝트 기본 트리: 개요 / 스크립트 / 인물 설정 / 메모 / 기타. 폴더는 기본으로 닫혀 있고 스크립트만 열려 있다.
- 자동 저장 3초, 저장 중 입력이 들어와도 잃지 않게 저장 시작 시점을 기록한다(`captureSaveState`/`markSavedAt`).
- 저장 순서: 지울 파일은 휴지통으로 → 이름 바꾸기 → 쓰기 → `project.json`은 **마지막**.

### 화면과 문구
- 화면에 보이는 모든 글은 **쉬운 한국어**. 전문 용어 대신 일상어("수정고", "백업 폴더 보기").
- 강조색 `#d4472b`(라이트) / `#ff7a5c`(다크). 다크 모드도 함께 맞춘다.
- 맥 앱에서는 HTML5 드래그 앤 드롭이 동작하지 않는다(`dragDropEnabled: false`). 트리 끌어 옮기기는 포인터 이벤트로 직접 구현했다.

### Git
- `*.dropkick/`(테스트 프로젝트), `dist-release/`, `samples/*.pdf`는 **커밋하지 않는다** (`.gitignore`에 있음).
- 서명 인증서 이름, 비밀번호, 열쇠 내용은 코드나 커밋에 넣지 않는다. 인증서 이름은 환경 변수로만 넘긴다.
- 커밋과 푸시는 사용자가 원할 때 한다. 커밋 메시지는 한국어로 짧게.

## 5. 일하는 방식

- 고치기 전에 관련 파일과 테스트를 먼저 읽는다. 새 기능에는 테스트를 함께 쓴다.
- 고친 뒤: `npm test` → `npx tsc --noEmit` → 개발용 앱에서 직접 확인.
- 확인하지 못한 것은 확인하지 못했다고 사용자에게 말한다.
- 되돌릴 수 없는 일(릴리즈 올리기·지우기, 공개 저장소 변경, 파일 삭제)은 사용자에게 먼저 묻는다.
- 다른 AI 도구와 같은 폴더를 **동시에** 고치지 않는다. 도구를 바꾸기 전에 커밋한다.

## 6. 남은 일

1. **2차: AI 분석** — Claude API와 Ollama(로컬) 중 고르는 설정, 구조(3막)·인물 비중·장면 요약·대사 톤 분석, 결과를 장면 단위로 표시 (`PLAN.md` 2차 단계). API 키와 Ollama 설정은 사용자가 시작할 때 알려 준다.
2. **수정고 2단계** — 촬영용 수정 표시(바뀐 줄 표시 등).
3. **자동 업데이트 실제 시험** — 0.1.1이 설치된 맥에서 0.1.2가 자동으로 받아지는지.
4. 코드 저장소를 공개할 때: 예전 커밋에 들어간 테스트 프로젝트를 git 기록에서 지울지 결정.

## 7. 배포 (요약, 자세한 것은 `docs/RELEASE.md`)

1. `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`의 version을 함께 올린다.
2. `release-notes/<버전>.md`에 바뀐 점을 쓴다 (앱 업데이트 알림에 그대로 보인다).
3. `APPLE_SIGNING_IDENTITY="Developer ID Application: …" ./scripts/release.sh`
   - 테스트 → 유니버설 빌드·서명 → 애플 공증(키체인 프로필 `dropkick-notary`) → 업데이트 파일 서명(`~/.tauri/dropkick-updater.key`, 암호는 키체인 `dropkick-updater-key`) → `gotgam100/DropKick_releases`에 올리기
   - 키체인 허용 창이 뜨면 사용자가 직접 누른다. 비밀번호를 대신 다루지 않는다.
4. 앱은 `releases/latest/download/latest.json`을 보고 업데이트한다. **업데이트 서명 열쇠를 잃어버리면 기존 사용자에게 업데이트를 보낼 수 없다.**

현재 배포 버전: **0.3.0** (2026-10-29).
