// PDF에 넣는 글꼴 파일 (public/fonts, OFL 라이선스)
export type FontFiles = {
  courier: Uint8Array;
  courierBold: Uint8Array;
  korean: Uint8Array;
  koreanBold: Uint8Array;
};

export const FONT_PATHS: Record<keyof FontFiles, string> = {
  courier: "fonts/CourierPrime-Regular.ttf",
  courierBold: "fonts/CourierPrime-Bold.ttf",
  korean: "fonts/NanumGothicCoding-Regular.ttf",
  koreanBold: "fonts/NanumGothicCoding-Bold.ttf",
};
