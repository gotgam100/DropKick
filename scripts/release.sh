#!/bin/bash
# 배포용 DropKick 만들고 올리기
#   테스트 → 서명된 유니버설 앱/디스크 이미지 → 애플 공증 → 자동 업데이트 파일 서명
#   → GitHub Release(gotgam100/DropKick_releases)에 올리기
#
# 처음 한 번 준비 (docs/RELEASE.md 참고):
#   1) 키체인에 "Developer ID Application" 인증서
#   2) 공증용 프로필: xcrun notarytool store-credentials "dropkick-notary" ...
#   3) 업데이트 서명 열쇠: ~/.tauri/dropkick-updater.key (+ 암호를 키체인 "dropkick-updater-key"에)
#
# 새 버전 낼 때:
#   - package.json, src-tauri/tauri.conf.json 의 version 올리기
#   - release-notes/<버전>.md 에 바뀐 점 쓰기
#   APPLE_SIGNING_IDENTITY="Developer ID Application: 이름 (팀ID)" ./scripts/release.sh
#   (올리지 않고 만들기만: --no-publish)
set -euo pipefail
cd "$(dirname "$0")/.."

PUBLISH=1
[[ "${1:-}" == "--no-publish" ]] && PUBLISH=0

: "${APPLE_SIGNING_IDENTITY:?APPLE_SIGNING_IDENTITY에 Developer ID Application 인증서 이름을 넣어 주세요}"
PROFILE="${NOTARY_PROFILE:-dropkick-notary}"
RELEASE_REPO="gotgam100/DropKick_releases"
UPDATER_KEY="${UPDATER_KEY:-$HOME/.tauri/dropkick-updater.key}"
# shellcheck disable=SC1091
source "$HOME/.cargo/env" 2>/dev/null || true

VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
PKG_VERSION=$(node -p "require('./package.json').version")
NOTES="release-notes/${VERSION}.md"
[[ "$VERSION" == "$PKG_VERSION" ]] || { echo "✗ 버전이 다릅니다: tauri.conf.json $VERSION / package.json $PKG_VERSION"; exit 1; }
[[ -f "$NOTES" ]] || { echo "✗ $NOTES 에 이번 버전의 바뀐 점을 써 주세요"; exit 1; }
[[ -f "$UPDATER_KEY" ]] || { echo "✗ 업데이트 서명 열쇠가 없습니다: $UPDATER_KEY (docs/RELEASE.md 참고)"; exit 1; }
if [[ $PUBLISH == 1 ]] && gh release view "v$VERSION" --repo "$RELEASE_REPO" >/dev/null 2>&1; then
  echo "✗ v$VERSION 은 이미 올라가 있습니다. 버전을 올려 주세요."; exit 1
fi

echo "▶ DropKick $VERSION"
echo "▶ 테스트"
npm test

echo "▶ 서명된 유니버설 앱(Apple Silicon + 인텔)과 디스크 이미지 만들기"
export APPLE_SIGNING_IDENTITY
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$UPDATER_KEY")"
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(security find-generic-password -s dropkick-updater-key -w 2>/dev/null || true)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
npx tauri build --target universal-apple-darwin --bundles app,dmg

BUNDLE=src-tauri/target/universal-apple-darwin/release/bundle
DMG=$(ls -t "$BUNDLE"/dmg/*.dmg | head -1)
APP="$BUNDLE/macos/DropKick.app"
echo "  실행 파일 종류: $(lipo -archs "$APP/Contents/MacOS/dropkick")"

echo "▶ 서명 확인"
codesign --verify --deep --strict --verbose=2 "$APP"

echo "▶ 애플 공증 (몇 분 걸립니다)"
xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait

echo "▶ 공증 결과 붙이기 (디스크 이미지와 앱)"
xcrun stapler staple "$DMG"
xcrun stapler staple "$APP"
spctl --assess --type open --context context:primary-signature --verbose "$DMG"

echo "▶ 자동 업데이트 파일 (공증된 앱으로 다시 묶고 서명)"
OUT=dist-release/$VERSION
rm -rf "$OUT" && mkdir -p "$OUT"
# 이름이 소문자로 시작하면 GitHub 릴리즈 파일 목록(이름순)에서 설치용 dmg가 맨 위에 보인다.
UPDATE_NAME="updater-DropKick_${VERSION}_universal.app.tar.gz"
COPYFILE_DISABLE=1 tar -czf "$OUT/$UPDATE_NAME" -C "$BUNDLE/macos" DropKick.app
npx tauri signer sign --app-version "$VERSION" "$OUT/$UPDATE_NAME" >/dev/null
cp "$DMG" "$OUT/DropKick_${VERSION}_universal.dmg"
node scripts/make-latest-json.mjs "$VERSION" "$OUT/$UPDATE_NAME.sig" "$UPDATE_NAME" "$NOTES" "$OUT/latest.json"

# 릴리즈 화면 설명 맨 위에 설치 안내를 붙인다. (앱의 업데이트 알림에는 이 안내 없이 바뀐 점만 나간다)
BODY="$OUT/release-body.md"
{
  echo "**설치하려면 \`DropKick_${VERSION}_universal.dmg\`를 받으세요.**"
  echo
  echo "> \`latest.json\`과 \`updater-\` 로 시작하는 파일은 앱의 자동 업데이트가 쓰는 파일이라 받지 않아도 됩니다."
  echo
  echo "---"
  echo
  cat "$NOTES"
} > "$BODY"

if [[ $PUBLISH == 1 ]]; then
  echo "▶ GitHub Release 올리기: $RELEASE_REPO v$VERSION"
  gh release create "v$VERSION" --repo "$RELEASE_REPO" --title "DropKick $VERSION" --notes-file "$BODY" \
    "$OUT/DropKick_${VERSION}_universal.dmg" "$OUT/$UPDATE_NAME" "$OUT/$UPDATE_NAME.sig" "$OUT/latest.json"
  echo "✅ 완료: https://github.com/$RELEASE_REPO/releases/tag/v$VERSION"
else
  echo "✅ 완료 (올리지 않음): $OUT"
fi
