// 일시 사용 제한 명단입니다. 복귀 시 해당 이름만 삭제하고 파일을 다시 배포하세요.
// Firebase 계정이나 작업 데이터는 변경하지 않습니다.
export const TEMPORARILY_RESTRICTED_USERS = Object.freeze([
  "안시영", "원기연", "최창원", "홍은철", "정현철"
]);

export const RESTRICTED_ACCOUNT_MESSAGE = "KDN MAP 사용이 제한된 계정입니다";

function normalizeRestrictedAccountId(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\s+/g, "")
    .replace(/@kdn\.local$/i, "");
}

export function isTemporarilyRestrictedUser(value) {
  const userId = normalizeRestrictedAccountId(value);
  return TEMPORARILY_RESTRICTED_USERS.includes(userId);
}
