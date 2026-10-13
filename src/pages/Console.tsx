// 用户端主页：无账号时仅显示添加界面；有账号时显示账户卡片网格
// 卡片：状态灯 + 开始挂卡 + 重命名/编辑/删除/详情；点击卡片进入详情
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, postJson, putJson, del, apiRaw, ApiError } from "../lib/api";
import { fmtExpireDash } from "../lib/format";

interface Account {
  id: number;
  bot_name: string;
  steam_username: string;
  status: string;
  server_name: string | null;
  server_id: number | null;
  expires_at: string | null;
  created_at: string;
}

const LIGHT: Record<string, string> = { online: "online", offline: "offline", pending: "pending" };

export default function Console() {
  const { me, reload } = useAuth();
  const nav = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 添加表单
  const [botName, setBotName] = useState("");
  const [steamUsername, setSteamUsername] = useState("");
  const [password, setPassword] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [adding, setAdding] = useState(false);

  // 挂卡交互状态
  const [farming, setFarming] = useState<Account | null>(null);
  const [noTimeAcc, setNoTimeAcc] = useState<Account | null>(null);
  const [farmStage, setFarmStage] = useState<"starting" | "polling" | "input" | "done" | "failed">("starting");
  const [farmInputType, setFarmInputType] = useState<3 | 5>(3);
  const [farmCode, setFarmCode] = useState("");
  const [farmMsg, setFarmMsg] = useState("");

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

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setAddMsg("");
    setError("");
    setAdding(true);
    try {
      const data = await postJson<{ id: number; bot_name: string; server_name: string }>("/api/accounts", {
        bot_name: botName,
        steam_username: steamUsername,
        password,
      });
      setAddMsg(`「${data.bot_name}」已添加，分配到服务器「${data.server_name}」`);
      setBotName("");
      setSteamUsername("");
      setPassword("");
      void load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "添加失败");
    } finally {
      setAdding(false);
    }
  }

  // ---------- 挂卡登录交互 ----------
  // ASF V6 EUserInputType：3=SteamGuard(邮箱令牌) 5=TwoFactorAuthentication(Steam令牌) 8=QrCodeLogin(二维码)
  // 8 表示 ASF 询问是否二维码登录：自动提交 N（拒绝，改用密码登录）
  const INPUT_TYPES = { 3: "邮箱令牌", 5: "Steam 令牌" } as const;

  async function startFarming(acc: Account) {
    if (!acc.server_id) return;
    // 无可用时间拦截：未兑换卡密（无到期）或已到期 → 弹窗引导去兑换
    if (!acc.expires_at || new Date(acc.expires_at).getTime() < Date.now()) {
      setNoTimeAcc(acc);
      return;
    }
    setFarming(acc);
    setFarmStage("starting");
    setFarmCode("");
    setFarmMsg("");
    try {
      // 预注入：拒绝二维码登录（必须早于 Start，避免 ASF 控制台输入竞态），强制走密码登录
      try {
        await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}/Input`, {
          method: "POST",
          body: JSON.stringify({ Type: 8, Value: "N" }),
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // bot 可能不存在，交给 Start 处理
      }
      const r = await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}/Start`, {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json().catch(() => ({}));
      if (j.Success === false) {
        setFarmStage("failed");
        setFarmMsg(j.Message || "启动失败");
        return;
      }
      await pollLogin(acc, 0);
    } catch {
      setFarmStage("failed");
      setFarmMsg("无法连接 ASF 服务器");
    }
  }

  async function pollLogin(acc: Account, round: number): Promise<void> {
    setFarmStage("polling");
    if (round >= 40) {
      setFarmStage("failed");
      setFarmMsg("登录超时，请重试");
      return;
    }
    try {
      const resp = await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}`, { method: "GET" });
      const j = (await resp.json()) as { Result?: Record<string, { RequiredInput?: number; IsConnectedAndLoggedOn?: boolean }> };
      const bot = j.Result?.[acc.bot_name];
      if (!bot) {
        setFarmStage("failed");
        setFarmMsg("未找到该 bot");
        return;
      }
      if (bot.IsConnectedAndLoggedOn) {
        setFarmStage("done");
        setFarmMsg("登录成功");
        void load();
        return;
      }
      const req = bot.RequiredInput ?? 0;
      if (req === 3 || req === 5) {
        setFarmInputType(req);
        setFarmStage("input");
        return; // 等待用户输入，不再自动轮询
      }
      if (req === 8) {
        // ASF 询问是否二维码登录 → 自动拒绝，改用密码登录
        setFarmMsg("正在使用密码登录…");
        try {
          await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}/Input`, {
            method: "POST",
            body: JSON.stringify({ Type: 8, Value: "N" }),
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          // 继续轮询
        }
        await new Promise((res) => setTimeout(res, 2000));
        return pollLogin(acc, round + 1);
      }
      await new Promise((res) => setTimeout(res, 2000));
      return pollLogin(acc, round + 1);
    } catch {
      await new Promise((res) => setTimeout(res, 2000));
      return pollLogin(acc, round + 1);
    }
  }

  async function submitFarmCode(acc: Account) {
    if (!farmCode.trim()) return;
    setFarmMsg("");
    try {
      const r = await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}/Input`, {
        method: "POST",
        body: JSON.stringify({ Type: farmInputType, Value: farmCode.trim() }),
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json().catch(() => ({}));
      if (j.Success === false) {
        setFarmStage("failed");
        setFarmMsg(j.Message || "提交失败");
        return;
      }
      setFarmCode("");
      await pollLogin(acc, 0);
    } catch {
      setFarmStage("failed");
      setFarmMsg("无法连接 ASF 服务器");
    }
  }

  function closeFarming() {
    setFarming(null);
    setFarmStage("starting");
  }

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
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <h1 style={{ marginBottom: 4 }}>添加 Steam 账户</h1>
          <div className="sub">配额 {accounts.length}/{me?.user.quota ?? 2} · 添加后自动分配到账号数最少的在线服务器</div>
        </div>
        <form className="form" onSubmit={addAccount}>
          <label>Bot 名称（自定义）</label>
          <input value={botName} onChange={(e) => setBotName(e.target.value)} autoFocus />
          <label>Steam 用户名</label>
          <input value={steamUsername} onChange={(e) => setSteamUsername(e.target.value)} />
          <label>Steam 密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="hint">密码加密保存，仅用于挂卡与迁移，不会明文回传</div>
          {error && <div className="err">{error}</div>}
          {addMsg && <div className="ok">{addMsg}</div>}
          <button className="btn" disabled={adding} style={{ width: "100%" }}>
            {adding ? "添加中…" : "添加账户"}
          </button>
        </form>
      </div>
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
          <div key={acc.id} className="account-card" onClick={() => nav(`/console/accounts/${acc.id}`)}>
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
                disabled={farming?.id === acc.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void startFarming(acc);
                }}
              >
                {farming?.id === acc.id ? "挂卡中…" : "开始挂卡"}
              </button>
            </div>
            <div className="actions" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => void renameAccount(acc)}>重命名</button>
              <button onClick={() => void editAccount(acc)}>编辑</button>
              <button className="danger" onClick={() => void deleteAccount(acc)}>删除</button>
              <button onClick={() => nav(`/console/accounts/${acc.id}`)}>详情</button>
            </div>
          </div>
        ))}
      </div>

      {/* 挂卡弹窗 */}
      {farming && (
        <div className="modal-mask" onClick={closeFarming}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{farming.bot_name} · 挂卡</h3>
            {farmStage === "starting" && <div className="hint">正在启动挂卡…</div>}
            {farmStage === "polling" && <div className="hint">正在检查登录状态…</div>}
            {farmStage === "input" && (
              <>
                <div className="hint">
                  ASF 需要验证：请{INPUT_TYPES[farmInputType]} {farmInputType === 3 ? "（邮件验证码）" : "（手机令牌）"}
                </div>
                <input
                  value={farmCode}
                  onChange={(e) => setFarmCode(e.target.value)}
                  placeholder={`请输入${INPUT_TYPES[farmInputType]}`}
                  autoFocus
                />
              </>
            )}
            {farmStage === "done" && <div className="ok">✓ 登录成功，挂卡已开始</div>}
            {farmStage === "failed" && <div className="err">{farmMsg}</div>}
            {farmMsg && farmStage !== "failed" && <div className="hint">{farmMsg}</div>}
            <div className="modal-actions">
              {farmStage === "input" && (
                <button className="btn btn-sm" disabled={!farmCode.trim()} onClick={() => void submitFarmCode(farming)}>
                  提交
                </button>
              )}
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  closeFarming();
                  void load();
                }}
              >
                {farmStage === "done" ? "完成" : "关闭"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 无可用时间弹窗 */}
      {noTimeAcc && (
        <div className="modal-mask" onClick={() => setNoTimeAcc(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>无可用时间</h3>
            <div className="hint">
              「{noTimeAcc.bot_name}」当前{noTimeAcc.expires_at ? "使用时间已到期" : "未兑换卡密（无可用时间）"}，
              兑换卡密后可开始挂卡。
            </div>
            <div className="modal-actions">
              <button className="btn btn-sm btn-secondary" onClick={() => setNoTimeAcc(null)}>取消</button>
              <button className="btn btn-sm" onClick={() => { setNoTimeAcc(null); nav("/console/redeem"); }}>
                前往兑换卡密
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 状态说明 */}
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
    </div>
  );
}
