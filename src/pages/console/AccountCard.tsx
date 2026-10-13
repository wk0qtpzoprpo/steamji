// 账户卡片：状态灯 + bot 名 + Steam 用户名 + 到期 + 开始挂卡 + 操作按钮；点击进入详情
import { fmtExpireDash } from "../../lib/format";
import type { Account } from "../account-detail/types";

const LIGHT: Record<string, string> = { online: "online", offline: "offline", pending: "pending" };

interface Props {
  acc: Account;
  farmingId: number | null;
  onStart: () => void;
  onRename: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
}

export default function AccountCard({ acc, farmingId, onStart, onRename, onEdit, onDelete, onDetail }: Props) {
  return (
    <div key={acc.id} className="account-card" onClick={onDetail}>
      <div className="top-row">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`status-light ${LIGHT[acc.status] ?? "pending"}`} title={acc.status} />
            <span className="bot-name">{acc.bot_name}</span>
          </div>
          <div className="steam-user">{acc.steam_username} · {acc.server_name ?? "未分配"}</div>
          <div className={acc.expires_at ? "expire" : "expire warn"}>
            {acc.expires_at
              ? new Date(acc.expires_at).getTime() < Date.now()
                ? "已到期 · 请兑换卡密"
                : `使用期至 ${fmtExpireDash(acc.expires_at)}`
              : "无可用时间"}
          </div>
        </div>
        <button
          className="farm-btn"
          disabled={farmingId === acc.id}
          onClick={(e) => {
            e.stopPropagation();
            onStart();
          }}
        >
          {farmingId === acc.id ? "挂卡中…" : "开始挂卡"}
        </button>
      </div>
      <div className="actions" onClick={(e) => e.stopPropagation()}>
        <button onClick={onRename}>重命名</button>
        <button onClick={onEdit}>编辑</button>
        <button className="danger" onClick={onDelete}>删除</button>
        <button onClick={onDetail}>详情</button>
      </div>
    </div>
  );
}
