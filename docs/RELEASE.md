# DropKick 배포 안내

주변 사람에게 나눠 줄 맥 앱(`DropKick.dmg`)을 만드는 방법입니다.

## 왜 서명과 공증이 필요한가

- **서명**: "이 앱은 이 개발자가 만들었다"는 표시입니다. Developer ID 인증서로 합니다.
- **공증**: 애플이 앱에 악성 코드가 없는지 검사하고 확인 도장을 찍어 주는 절차입니다.
- 둘 다 하면 받는 사람이 **경고 없이** 앱을 열 수 있습니다. 하지 않으면 "확인되지 않은 개발자" 경고가 나와서, 받는 사람이 시스템 설정에서 직접 허용해야 합니다.

## 처음 한 번만 준비

### 1. 인증서 확인

이 맥의 키체인에는 이미 **Developer ID Application** 인증서가 있습니다. 터미널에서 이름을 확인할 수 있습니다.

```bash
security find-identity -v -p codesigning
```

`Developer ID Application: 이름 (팀ID)` 줄이 쓰는 이름입니다.

### 2. 공증용 앱 암호 만들기

1. [appleid.apple.com](https://appleid.apple.com) → 로그인 및 보안 → **앱 암호** → 새로 만들기 (이름 예: DropKick 공증)
2. 만들어진 암호를 복사해 둡니다. (이 암호는 공증에만 쓰입니다)

### 3. 공증 정보를 키체인에 저장

터미널에서 아래를 실행하면 Apple ID와 앱 암호를 묻습니다. 직접 입력하세요. 암호는 맥 키체인에만 저장되고 저장소에는 들어가지 않습니다.

```bash
xcrun notarytool store-credentials "dropkick-notary" --apple-id "Apple ID 이메일" --team-id "팀ID"
```

## 배포용 앱 만들기

```bash
APPLE_SIGNING_IDENTITY="Developer ID Application: 이름 (팀ID)" ./scripts/release.sh
```

- 테스트 → 서명된 앱과 `.dmg` 만들기 → 애플 공증(몇 분) → 공증 결과 붙이기 순서로 진행됩니다.
- 처음 서명할 때 키체인 접근을 허용할지 묻는 창이 뜨면 **항상 허용**을 누르세요.
- 결과: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/DropKick_0.1.0_universal.dmg`
- **유니버설 앱**이라 Apple Silicon(M1 이후)과 인텔 맥 모두에서 돌아갑니다. 각 맥은 자기에게 맞는 실행 파일을 골라 쓰므로 속도 차이는 없고, 앱 크기만 두 배 정도입니다.

## 받는 사람

1. `.dmg`를 열고 DropKick을 응용 프로그램 폴더로 끌어 놓습니다.
2. 처음 열 때 "인터넷에서 다운로드한 앱" 확인 창이 한 번 나옵니다. 열기를 누르면 됩니다.
3. `.dropkick` 프로젝트는 Finder에서 파일 하나로 보이고, 더블클릭하면 DropKick에서 열립니다.

## 참고

- 처음 유니버설로 빌드하는 맥에서는 인텔용 Rust 대상을 한 번 추가합니다: `rustup target add x86_64-apple-darwin`
- **최소 macOS 13 (Ventura)** 이상에서 설치됩니다.
- 화면의 한글 줄바꿈을 PDF와 똑같이 맞추는 기능은 **Safari 17 이상**(macOS 14 이상, 또는 Safari를 업데이트한 macOS 13)에서 정확합니다. 그보다 오래된 경우에도 쓰기·저장·PDF는 정상이고, 화면의 페이지 경계만 PDF와 조금 어긋날 수 있습니다.
- 버전을 올릴 때는 `src-tauri/tauri.conf.json`과 `package.json`의 `version`을 함께 바꿉니다.
