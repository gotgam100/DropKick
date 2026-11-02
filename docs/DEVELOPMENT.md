# 개발 안내

DropKick은 **Tauri 2**(Rust) + **Vite + React + TypeScript** + **CodeMirror 6**으로 만든 macOS 앱입니다. 라이선스는 MIT입니다.

## 개발 환경

- macOS, Xcode
- Node.js 20 이상
- Rust (rustup)

## 실행

```bash
npm install
npm run tauri dev
```

## 테스트

```bash
npm test
npx tsc --noEmit
```

## 테스트용 원고

- `samples/short-5p.fountain`: 단편 (표지 + 본문 6페이지)
- `samples/long-100p.fountain`: 100페이지 (`node scripts/make-long-sample.mjs`로 다시 만들 수 있음)
- 개발 서버에서 `http://localhost:1420/?sample=long` 처럼 열면 바로 불러옵니다.

## 앱 빌드

```bash
npm run tauri build
```

서명·공증까지 한 배포용 `.dmg`는 [RELEASE.md](RELEASE.md)를 따라 `scripts/release.sh`로 만듭니다.

## 구조와 규칙

폴더 구조와 꼭 지켜야 할 규칙(화면 = PDF 일치, 프로젝트 파일 형식 등)은 저장소 맨 위의 [AGENTS.md](../AGENTS.md)에 정리되어 있습니다.

## 기여하기

버그 제보와 제안은 [GitHub Issues](https://github.com/gotgam100/DropKick/issues)나 [구글 폼](https://forms.gle/wvM2BMZYv3guuYWx7)으로 남겨 주세요. 코드를 고쳐 보내 주실 때는 `npm test`와 `npx tsc --noEmit`이 모두 통과하는지 확인해 주세요.
