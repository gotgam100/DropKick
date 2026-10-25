#!/bin/bash
# 배포용 DropKick 만들기: 테스트 → 서명된 앱/디스크 이미지 빌드 → 애플 공증 → 스테이플
#
# 처음 한 번 준비 (docs/RELEASE.md 참고):
#   1) 키체인에 "Developer ID Application" 인증서
#   2) 공증용 프로필: xcrun notarytool store-credentials "dropkick-notary" ...
#
# 실행:
#   APPLE_SIGNING_IDENTITY="Developer ID Application: 이름 (팀ID)" ./scripts/release.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${APPLE_SIGNING_IDENTITY:?APPLE_SIGNING_IDENTITY에 Developer ID Application 인증서 이름을 넣어 주세요}"
PROFILE="${NOTARY_PROFILE:-dropkick-notary}"
# shellcheck disable=SC1091
source "$HOME/.cargo/env" 2>/dev/null || true

echo "▶ 테스트"
npm test

echo "▶ 서명된 앱과 디스크 이미지 만들기"
export APPLE_SIGNING_IDENTITY
npx tauri build --bundles app,dmg

DMG=$(ls -t src-tauri/target/release/bundle/dmg/*.dmg | head -1)
APP=src-tauri/target/release/bundle/macos/DropKick.app

echo "▶ 서명 확인"
codesign --verify --deep --strict --verbose=2 "$APP"

echo "▶ 애플 공증 (몇 분 걸립니다)"
xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait

echo "▶ 공증 결과 붙이기"
xcrun stapler staple "$DMG"
spctl --assess --type open --context context:primary-signature --verbose "$DMG"

echo "✅ 완료: $DMG"
