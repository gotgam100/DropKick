# DropKick

macOS용 **한글 시나리오 작성 앱**입니다. 할리우드 표준 형식(Fountain)에 맞춰 시나리오를 쓰고, 100페이지 분량의 장편도 가볍게 다룰 수 있도록 만들고 있습니다.

원고는 표준 [Fountain](https://fountain.io) 형식(`.fountain`)으로 저장되어 다른 시나리오 프로그램에서도 열 수 있습니다.

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

## 앱 빌드

```bash
npm run tauri build
```

## 사용한 오픈소스

| 오픈소스 | 라이선스 |
|---|---|
| [Tauri](https://github.com/tauri-apps/tauri) | Apache-2.0 / MIT |
| [React](https://github.com/facebook/react) | MIT |
| [Vite](https://github.com/vitejs/vite) | MIT |
| [CodeMirror 6](https://github.com/codemirror/dev) | MIT |
| [Tauri Dialog 플러그인](https://github.com/tauri-apps/plugins-workspace) | Apache-2.0 / MIT |
| [Vitest](https://github.com/vitest-dev/vitest) | MIT |

## 라이선스

[MIT](LICENSE)
