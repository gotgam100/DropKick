# DropKick

macOS용 **한글 시나리오 작성 앱**입니다. 할리우드 시나리오 양식에 맞춰 시나리오를 쓰고, 100페이지 분량의 장편도 가볍게 다룰 수 있도록 만들고 있습니다.

많은 글로벌 시나리오 프로그램이 쓰는 공개 텍스트 형식인 [Fountain](https://fountain.io)(`.fountain`)을 기반으로 원고를 저장하므로, Fountain을 지원하는 다른 시나리오 프로그램에서도 열 수 있습니다.

> 개발 중입니다. 전체 계획은 [PLAN.md](PLAN.md)를 참고하세요.

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
```

## 테스트용 원고

- `samples/short-5p.fountain`: 단편 (표지 + 본문 6페이지)
- `samples/long-100p.fountain`: 100페이지 (`node scripts/make-long-sample.mjs`로 다시 만들 수 있음)
- 개발 서버에서 `http://localhost:1420/?sample=long` 처럼 열면 바로 불러온다.

## 앱 빌드

```bash
npm run tauri build
```

서명·공증까지 한 배포용 `.dmg`는 [docs/RELEASE.md](docs/RELEASE.md)를 따라 `scripts/release.sh`로 만든다.

## 사용한 오픈소스

| 오픈소스 | 라이선스 |
|---|---|
| [Tauri](https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT |
| [React](https://github.com/facebook/react) | MIT |
| [Vite](https://github.com/vitejs/vite) | MIT |
| [CodeMirror 6](https://github.com/codemirror/dev) | MIT |
| [pdf-lib](https://github.com/Hopding/pdf-lib), [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) | MIT |
| [Courier Prime](https://github.com/quoteunquoteapps/CourierPrime) 글꼴 | OFL-1.1 (`public/fonts/OFL-CourierPrime.txt`) |
| [나눔고딕코딩](https://github.com/google/fonts/tree/main/ofl/nanumgothiccoding) 글꼴 | OFL-1.1 (`public/fonts/OFL-NanumGothicCoding.txt`) |
| [Tauri Dialog 플러그인](https://github.com/tauri-apps/plugins-workspace) | Apache-2.0 / MIT |
| [Vitest](https://github.com/vitest-dev/vitest) | MIT |

## 라이선스

[MIT](LICENSE)
