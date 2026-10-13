// 展示格式化纯函数（可单测，无 React/浏览器依赖）
// fmtExpireSlash：账户详情页用（YYYY/MM/DD，空值显示"无可用时间"）
// fmtExpireDash：账户卡片用（YYYY-MM-DD）
export function fmtExpireSlash(v: string | null): string {
  if (!v) return "无可用时间";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "无可用时间";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

export function fmtExpireDash(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 秒数 → HH:MM:SS（挂时长计时）
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// Steam 游戏封面图 URL（无 AppID 返回 null）
export function steamCover(appId: number | undefined): string | null {
  return appId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg` : null;
}
