// 账户详情页：挂卡控制中心 + 挂时长模式（手动填 APPID，切回挂卡前保持；支持 Steam 状态切换）
// 数据/逻辑层：加载、挂卡/挂时长动作、模式切换、pending 轮询
// 渲染层：FarmModePanel（挂卡模式）/ PlayModePanel（挂时长模式）
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, apiRaw, del, putJson } from "../lib/api";
import { fmtExpireSlash } from "../lib/format";
import FarmModePanel from "./account-detail/FarmModePanel";
import PlayModePanel from "./account-detail/PlayModePanel";
import type { Account, BotObj, ModeKey, PlaySession } from "./account-detail/types";

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [account, setAccount] = useState<Account | null>(null);
  const [bot, setBot] = useState<BotObj | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"start" | "stop" | "del" | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [actionErr, setActionErr] = useState("");

  // 挂时长模式状态
  const [mode, setMode] = useState<ModeKey>("farm");
  const [session, setSession] = useState<PlaySession | null>(null);
  const [playInput, setPlayInput] = useState("");
  const [playStatus, setPlayStatus] = useState<0 | 1>(0); // 0=离线 1=正在游戏中
  const [playDisplayName, setPlayDisplayName] = useState("");
  const [farmDisplayName, setFarmDisplayName] = useState("");
  const [displayNameBusy, setDisplayNameBusy] = useState(false);
  const [playMsg, setPlayMsg] = useState("");
  const [playErr, setPlayErr] = useState("");
  const [playBusy, setPlayBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 卸载时清理状态切换轮询
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function load() {
    setRefreshing(true);
    setErr("");
    try {
      const list = await api<Account[]>("/api/accounts");
      const acc = list.find((a) => a.id === Number(id));
      if (!acc) {
        setErr("账号不存在");
        return;
      }
      setAccount(acc);
      setFarmDisplayName(acc.display_name ?? "");
      if (!acc.server_id) return;
      const resp = await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}`, { method: "GET" });
      const j = (await resp.json()) as { Result?: Record<string, BotObj> };
      setBot(j.Result?.[acc.bot_name] ?? null);
      // 恢复挂时长状态：有 pending/active 会话则默认进入挂时长模式
      try {
        const sessions = await api<PlaySession[]>("/api/play");
        const mine = sessions.find((s) => s.account_id === acc.id) ?? null;
        setSession(mine);
        if (mine) {
          setMode("play");
          if (mine.status === "pending") startPendingPoll(acc.id);
        }
      } catch {
        /* 查询失败不阻塞页面 */
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 挂时长模式每秒刷新已挂时长
  useEffect(() => {
    if (mode !== "play") return;
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [mode]);

  async function startFarm() {
    if (!account?.server_id) return;
    setBusy("start");
    setActionMsg("");
    setActionErr("");
    try {
      const r = await apiRaw(`/api/proxy/${account.server_id}/Api/Bot/${encodeURIComponent(account.bot_name)}/Start`, {
        method: "POST",
      });
      const j = (await r.json().catch(() => null)) as { Success?: boolean; Message?: string } | null;
      if (!r.ok || (j && j.Success === false)) {
        setActionErr((j && j.Message) || "启动失败");
      } else {
        setActionMsg("已开始挂卡，正在连接 Steam…");
        setTimeout(() => void load(), 1500);
      }
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function stopFarm() {
    if (!account?.server_id) return;
    setBusy("stop");
    setActionMsg("");
    setActionErr("");
    try {
      const r = await apiRaw(`/api/proxy/${account.server_id}/Api/Bot/${encodeURIComponent(account.bot_name)}/Stop`, {
        method: "POST",
      });
      const j = (await r.json().catch(() => null)) as { Success?: boolean; Message?: string } | null;
      if (!r.ok || (j && j.Success === false)) {
        setActionErr((j && j.Message) || "停止失败");
      } else {
        setActionMsg("已停止挂卡");
        setTimeout(() => void load(), 1000);
      }
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function unbind() {
    if (!window.confirm(`确定解绑并退出「${account?.bot_name}」吗？该账户将从 ASF 中移除。`)) return;
    setBusy("del");
    try {
      await del(`/api/accounts/${account!.id}`);
      nav("/console");
    } catch (e) {
      setActionErr((e as Error).message);
      setBusy(null);
    }
  }

  // 解析输入框 APPID（逗号/空格分隔，去重）
  function parseInputIds(): number[] {
    return [...new Set(
      playInput.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean).map(Number)
    )].filter((x) => Number.isInteger(x) && x > 0);
  }

  // 挂卡模式：应用自定义显示名称（需重启 bot，1 小时限 3 次）
  async function applyFarmDisplayName() {
    if (!account) return;
    const name = farmDisplayName.trim();
    if (name.length > 60) {
      setActionErr("显示名称最长 60 字符");
      return;
    }
    setDisplayNameBusy(true);
    setActionMsg("");
    setActionErr("");
    try {
      await putJson(`/api/accounts/${account.id}`, { display_name: name });
      setActionMsg(name ? "显示名称已应用，正在重启 bot（约 10-60 秒）" : "已清除显示名称，正在重启 bot（约 10-60 秒）");
      setTimeout(() => void load(), 2000);
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setDisplayNameBusy(false);
    }
  }

  async function applyPlay() {
    if (!account) return;
    const ids = parseInputIds();
    if (ids.length === 0) {
      setPlayErr("请至少填写 1 个 APPID");
      return;
    }
    if (ids.length > 32) {
      setPlayErr("APPID 最多 32 个");
      return;
    }
    setPlayBusy(true);
    setPlayMsg("");
    setPlayErr("");
    try {
      const s = await api<PlaySession>("/api/play", {
        method: "POST",
        body: JSON.stringify({
          account_id: account.id,
          app_ids: ids,
          online_status: playStatus,
          display_name: playDisplayName.trim() || undefined,
        }),
      });
      setSession(s);
      setMode("play");
      if (s.status === "pending") {
        setPlayMsg("正在重启 bot 应用 Steam 状态（约 10-60 秒），登录后自动开始挂时长…");
        startPendingPoll(account.id);
      } else {
        setPlayMsg("已开始挂时长，切换回挂卡模式前将持续保持");
      }
    } catch (e) {
      setPlayErr((e as Error).message);
    } finally {
      setPlayBusy(false);
    }
  }

  // 挂时长进行中：更新自定义显示名称（同状态直接 play，即时生效，不消耗切换次数）
  async function updatePlayName() {
    if (!account || !session) return;
    const name = playDisplayName.trim();
    if (name.length > 60) {
      setPlayErr("显示名称最长 60 字符");
      return;
    }
    setPlayBusy(true);
    setPlayMsg("");
    setPlayErr("");
    try {
      const s = await api<PlaySession>("/api/play", {
        method: "POST",
        body: JSON.stringify({
          account_id: account.id,
          app_ids: session.app_ids,
          online_status: session.online_status,
          display_name: name || undefined,
        }),
      });
      setSession(s);
      setPlayMsg(name ? "显示名称已更新（即时生效）" : "已清除显示名称（即时生效）");
    } catch (e) {
      setPlayErr((e as Error).message);
    } finally {
      setPlayBusy(false);
    }
  }

  // pending（状态切换重启中）轮询：bot 登录完成后自动开始挂时长
  function startPendingPoll(accountId: number) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const sessions = await api<PlaySession[]>("/api/play");
        const mine = sessions.find((x) => x.account_id === accountId) ?? null;
        if (mine && mine.status === "active") {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setSession(mine);
          setPlayMsg("已开始挂时长，切换回挂卡模式前将持续保持");
        } else if (!mine) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setSession(null);
          setPlayMsg("");
          setPlayErr("状态切换已被取消或失败，请重试");
        }
      } catch {
        /* 轮询失败下一轮重试 */
      }
    }, 8000);
  }

  async function cancelPlay() {
    if (!account || !session) return;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPlayBusy(true);
    setPlayMsg("");
    setPlayErr("");
    try {
      await api("/api/play/cancel", { method: "POST", body: JSON.stringify({ account_id: account.id }) });
      setSession(null);
      setMode("farm");
      setPlayMsg("");
      setTimeout(() => void load(), 800);
    } catch (e) {
      setPlayErr((e as Error).message);
    } finally {
      setPlayBusy(false);
    }
  }

  // 切换到挂卡模式：若有挂时长会话先确认并取消
  async function switchToFarm() {
    if (mode === "farm") return;
    if (session && !window.confirm("切换回挂卡模式将结束当前挂时长并恢复自动挂卡，确定？")) return;
    if (session) {
      await cancelPlay();
    } else {
      setMode("farm");
    }
  }

  if (loading) return <div className="center">加载中…</div>;
  if (err) return <div className="center"><div className="err">{err}</div></div>;
  if (!account) return null;

  const loggedOn = !!bot?.IsConnectedAndLoggedOn;
  const farmer = bot?.CardsFarmer;
  const nowFarming = !!farmer?.NowFarming && !farmer.Paused;
  const gamesToFarm = farmer?.GamesToFarm ?? [];
  const currentGames = farmer?.CurrentGamesFarming ?? [];
  const expired = !account.expires_at || new Date(account.expires_at).getTime() < Date.now();

  // 挂时长会话展示数据
  const sessionAppIds = session?.app_ids ?? [];
  const sessionSeconds = session ? Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)) : 0;
  const playAppNames: Record<number, string | undefined> = {};
  for (const g of currentGames) {
    if (g.AppID !== undefined) playAppNames[g.AppID] = g.GameName;
  }

  return (
    <div>
      {/* 顶部栏：有效期 / 重扫 / 解绑退出 */}
      <div className="detail-topbar">
        <div className="detail-topbar-left">
          <button className="btn btn-sm btn-secondary" onClick={() => nav("/console")}>← 返回</button>
          <span className={`status-light ${loggedOn ? "online" : "offline"}`} />
          <strong>{account.bot_name}</strong>
          {nowFarming && <span className="badge badge-online">挂卡中</span>}
          {session && <span className="badge badge-play">挂时长中</span>}
          {!loggedOn && <span className="badge badge-warn">未登录</span>}
        </div>
        <div className="detail-topbar-right">
          <span className={`expire-chip ${expired ? "warn" : ""}`}>有效至 {fmtExpireSlash(account.expires_at)}</span>
          <button className="btn btn-sm btn-secondary" onClick={() => void load()} disabled={refreshing}>
            {refreshing ? "重扫中…" : "重扫"}
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => void unbind()} disabled={busy === "del"}>
            {busy === "del" ? "处理中…" : "解绑并退出"}
          </button>
        </div>
      </div>
      <div className="sub" style={{ marginBottom: 12 }}>
        {account.steam_username} · {account.server_name ?? "未分配"}
        {bot?.Nickname ? ` · ${bot.Nickname}` : ""}
        {bot?.SteamID && bot.SteamID !== "0" ? ` · SteamID ${bot.SteamID}` : ""}
      </div>

      {/* 模式切换 */}
      <div className="mode-tabs">
        <button className={`mode-tab ${mode === "farm" ? "active" : ""}`} onClick={() => void switchToFarm()}>
          挂卡模式
        </button>
        <button className={`mode-tab ${mode === "play" ? "active" : ""}`} onClick={() => setMode("play")}>
          挂时长模式
        </button>
      </div>

      {actionMsg && <div className="ok" style={{ marginBottom: 12 }}>{actionMsg}</div>}
      {actionErr && <div className="err" style={{ marginBottom: 12 }}>{actionErr}</div>}

      {mode === "farm" ? (
        <FarmModePanel
          account={account}
          bot={bot}
          nowFarming={nowFarming}
          loggedOn={loggedOn}
          expired={expired}
          farmDisplayName={farmDisplayName}
          setFarmDisplayName={setFarmDisplayName}
          displayNameBusy={displayNameBusy}
          busy={busy}
          refreshing={refreshing}
          onStart={() => void startFarm()}
          onStop={() => void stopFarm()}
          onApplyName={() => void applyFarmDisplayName()}
          onRefresh={() => void load()}
          onBack={() => nav("/console")}
          onUnbind={() => void unbind()}
        />
      ) : (
        <PlayModePanel
          session={session}
          loggedOn={loggedOn}
          expired={expired}
          playInput={playInput}
          setPlayInput={setPlayInput}
          playStatus={playStatus}
          setPlayStatus={setPlayStatus}
          playDisplayName={playDisplayName}
          setPlayDisplayName={setPlayDisplayName}
          playMsg={playMsg}
          playErr={playErr}
          playBusy={playBusy}
          sessionAppIds={sessionAppIds}
          sessionSeconds={sessionSeconds}
          playAppNames={playAppNames}
          onApply={() => void applyPlay()}
          onCancel={() => void cancelPlay()}
          onUpdateName={() => void updatePlayName()}
        />
      )}
    </div>
  );
}
