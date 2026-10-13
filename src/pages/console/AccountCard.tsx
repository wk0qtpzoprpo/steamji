// 账户卡片：状态灯 + bot 名 + Steam 用户名 + 到期 + 开始挂卡 + 操作按钮；点击进入详情
import { useEffect, useState } from "react";
import { fmtExpireDash } from "../../lib/format";
import type { Account } from "../account-detail/types";

const LIGHT: Record<string, string> = { online: "online", offline: "offline", pending: "pending" };

// 令牌后台登录状态：pending=正在登录（灯灰），failed=令牌错误（灯红），done=登录成功（灯绿）
interface LoginState {
  botName: string;
  status: "pending" | "failed" | "done";
}

interface Props {
  acc: Account;
  farmingId: number | null;
  lastDoneBot: string | null;
  loginState: LoginState | null;
  onStart: () => void;
  onRename: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
}

export default function AccountCard({ acc, farmingId, lastDoneBot, loginState, onStart, onRename, onEdit, onDelete, onDetail }: Props) {
  const isThis = loginState?.botName === acc.bot_name;
  // 优先级：令牌登录中（灰）> 令牌失败（红）> 令牌成功（绿）> 密码刚登录成功（绿）>
  // 需重新登录（灰，服务器丢数据后需令牌）> 账号异常（红，反复登录失败）> 账号实时状态
  const light =
    isThis && loginState.status === "pending"
      ? "pending"
      : isThis && loginState.status === "failed"
        ? "offline"
        : isThis && loginState.status === "done" || lastDoneBot === acc.bot_name
          ? "online"
          : acc.auth_state === "login_required"
            ? "pending"
            : acc.auth_state === "account_error"
              ? "offline"
              : (LIGHT[acc.status] ?? "pending");
  // "登录成功"文案仅显示 2 秒（绿灯保留，等待列表同步后自然一致）
  const [showDone, setShowDone] = useState(false);
  useEffect(() => {
    if (isThis && loginState?.status === "done") {
      setShowDone(true);
      const t = setTimeout(() => setShowDone(false), 2000);
      return () => clearTimeout(t);
    }
    setShowDone(false);
  }, [isThis, loginState?.botName, loginState?.status]);
  const loginHint =
    isThis && loginState.status === "pending"
      ? "正在登录，请稍后…"
      : isThis && loginState.status === "failed"
        ? "令牌错误，请检查"
        : isThis && loginState.status === "done" && showDone
          ? "登录成功"
          : acc.auth_state === "login_required"
            ? "登录状态异常，请点击挂卡重新登录"
            : acc.auth_state === "account_error"
              ? "账号异常，请重新登录"
              : null;
  // 登录中禁用挂卡按钮；登录成功（done）不阻塞；需重新登录/账号异常不阻塞（允许点击挂卡重新登录）
  const busy = farmingId === acc.id || (isThis && loginState.status === "pending");
  const hintClass = isThis && loginState.status === "failed" ? "error" : isThis && loginState.status === "done" ? "ok" : acc.auth_state === "account_error" ? "error" : "pending";
  const title = loginHint ?? (lastDoneBot === acc.bot_name ? "登录成功" : acc.status);
  return (
    <div key={acc.id} className="account-card" onClick={onDetail}>
      <div className="top-row">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`status-light ${light}`} title={title} />
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
          {loginHint && <div className={`login-hint ${hintClass}`}>{loginHint}</div>}
        </div>
        <button
          className="farm-btn"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onStart();
          }}
        >
          {farmingId === acc.id ? "挂卡中…" : isThis && loginState.status === "pending" ? "登录中…" : "开始挂卡"}
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
