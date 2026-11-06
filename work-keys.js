// Wire identities are shared with existing Firebase documents; preserve punctuation and leading zeros.
function keyPart(value) { return String(value || "").trim().replace(/\s+/g, "").replace(/[|]/g, "_"); }
export function stableRowKey(part, groupNo, index, row = {}) {
  const group = row.statusGroupNo ?? groupNo, position = row.statusRowIndex ?? index;
  const bits = [row.m, row.c, row.f, row.n2].map(keyPart);
  const base = "v2|" + keyPart(group) + "|" + (bits.some(Boolean) ? bits.join("|") : "idx:" + position);
  return part === "reinforcement" ? base : part + "|" + base;
}
export function safeDocId(value) { return encodeURIComponent(String(value || "")).replaceAll(".", "%2E"); }
export function markerMemoKey(part, groupNo) { return "markerMemo|" + part + "|" + String(groupNo || ""); }
export function displayWorker(email) { return String(email || "").trim().replace("@kdn.local", ""); }
const seoul = new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Seoul", year:"numeric", month:"2-digit",
  day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"});
export function formatWorkTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0 || !Number.isFinite(new Date(ms).getTime())) return "기록 없음";
  const p = Object.fromEntries(seoul.formatToParts(new Date(ms)).map(v => [v.type, v.value]));
  return p.year+"-"+p.month+"-"+p.day+" "+p.hour+":"+p.minute+":"+p.second;
}
