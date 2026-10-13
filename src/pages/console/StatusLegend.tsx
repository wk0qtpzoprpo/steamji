// 状态灯说明（账户卡片页底部）
export default function StatusLegend() {
  return (
    <div style={{ marginTop: 20, padding: "12px 14px", background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>
      <div><strong style={{ color: "var(--text)" }}>状态灯说明</strong></div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span><span className="status-light online" /> 绿 = 已登录</span>
        <span style={{ marginLeft: 12 }}><span className="status-light offline" /> 红 = 离线</span>
        <span style={{ marginLeft: 12 }}><span className="status-light pending" /> 灰 = 准备中</span>
      </div>
      <div style={{ marginTop: 4 }}>
        添加账号后需等待约 5 分钟自动同步状态（灰灯 → 绿/红灯）；点击「开始挂卡」可立即登录，登录后状态即时更新。
      </div>
    </div>
  );
}
