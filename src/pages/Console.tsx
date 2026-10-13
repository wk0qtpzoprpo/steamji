// 用户端主页：无账号时仅显示添加界面；有账号时显示账户卡片网格
// 卡片：状态灯 + 开始挂卡 + 重命名/编辑/删除/详情；点击卡片进入详情
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, putJson, del, ApiError } from "../lib/api";
import { useFarmLogin } from "../hooks/useFarmLogin";
import type { Account } from "./account-detail/types";
import AccountCard from "./console/AccountCard";
import AddAccountForm from "./console/AddAccountForm";
import FarmModal from "./console/FarmModal";
import NoTimeModal from "./console/NoTimeModal";
import StatusLegend from "./console/StatusLegend";

export default function Console() {
  const { me, reload } = useAuth();
  const nav = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 挂卡登录交互状态机
  const farm = useFarmLogin(() => void load());

  async function load() {
    setLoading(true);
    try {
      setAccounts(await api<Account[]>("/api/accounts"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void reload();
  }, []);

  // ---------- 卡片操作 ----------
  async function renameAccount(acc: Account) {
    const name = window.prompt("新的 Bot 名称：", acc.bot_name);
    if (!name || name === acc.bot_name) return;
    try {
      await putJson(`/api/accounts/${acc.id}`, { bot_name: name });
      void load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "重命名失败");
    }
  }

  async function editAccount(acc: Account) {
    const pwd = window.prompt("新的 Steam 密码：");
    if (!pwd) return;
    try {
      await putJson(`/api/accounts/${acc.id}`, { password: pwd });
      alert("密码已更新");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "更新失败");
    }
  }

  async function deleteAccount(acc: Account) {
    if (!window.confirm(`确认删除「${acc.bot_name}」？ASF 上的 bot 也会一并删除。`)) return;
    try {
      await del(`/api/accounts/${acc.id}`);
      void load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "删除失败");
    }
  }

  if (loading) return <div className="center">加载中…</div>;

  // ---------- 渲染：添加界面（无账号时） ----------
  if (accounts.length === 0) {
    return (
      <AddAccountForm
        quota={me?.user.quota ?? 2}
        current={accounts.length}
        onAdded={() => void load()}
      />
    );
  }

  // ---------- 渲染：账户卡片网格 ----------
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>我的账户</h1>
          <div className="sub">共 {accounts.length}/{me?.user.quota ?? 2} 个 · 点击卡片查看详情</div>
        </div>
        <button className="btn" onClick={() => nav("/console/add")}>＋ 添加账户</button>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="account-grid">
        {accounts.map((acc) => (
          <AccountCard
            key={acc.id}
            acc={acc}
            farmingId={farm.farming?.id ?? null}
            lastDoneBot={farm.lastDoneBot}
            loginState={farm.pendingLogin ? { botName: farm.pendingLogin.acc.bot_name, status: farm.pendingLogin.status } : null}
            onStart={() => farm.startFarming(acc)}
            onRename={() => void renameAccount(acc)}
            onEdit={() => void editAccount(acc)}
            onDelete={() => void deleteAccount(acc)}
            onDetail={() => nav(`/console/accounts/${acc.id}`)}
          />
        ))}
      </div>

      {/* 挂卡弹窗 */}
      {farm.farming && (
        <FarmModal
          acc={farm.farming}
          stage={farm.stage}
          inputType={farm.inputType}
          code={farm.code}
          msg={farm.msg}
          onCodeChange={farm.setCode}
          onSubmit={() => void farm.submitCode(farm.farming!)}
          onClose={() => {
            farm.close();
            void load();
          }}
        />
      )}

      {/* 无可用时间弹窗 */}
      {farm.noTimeAcc && (
        <NoTimeModal
          acc={farm.noTimeAcc}
          onClose={farm.dismissNoTime}
          onRedeem={() => {
            farm.dismissNoTime();
            nav("/console/redeem");
          }}
        />
      )}

      {/* 状态说明 */}
      <StatusLegend />
    </div>
  );
}
