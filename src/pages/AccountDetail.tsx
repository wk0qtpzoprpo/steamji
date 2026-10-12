// 账户详情页：挂卡控制中心 + 挂时长模式（手动填 APPID，切回挂卡前保持；支持 Steam 状态切换）
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, apiRaw, del, putJson } from "../lib/api";

interface Account {
  id: number;
  bot_name: string;
  steam_username: string;
  status: string;
  server_name: string | null;
  server_id: number | null;
  expires_at: string | null;
  display_name: string | null;
}

interface FarmGame {
  AppID?: number;
  CardsRemaining?: number;
  GameName?: string;
  TimeRemaining?: string;
}

interface BotObj {
  BotName?: string;
  IsConnectedAndLoggedOn?: boolean;
  RequiredInput?: number;
  KeepRunning?: boolean;
  Nickname?: string | null;
  SteamID?: string;
  WalletBalance?: number;
  WalletCurrency?: number;
  CardsFarmer?: {
    CurrentGamesFarming?: FarmGame[];
    GamesToFarm?: FarmGame[];
    TimeRemaining?: string;
    NowFarming?: boolean;
    Paused?: boolean;
  };
}

interface PlaySession {
  id: number;
  account_id: number;
  bot_name: string;
  server_id: number;
  app_ids: number[];
  online_status: number;
  display_name: string | null;
  started_at: string;
  status: string;
}

type ModeKey = "farm" | "play";
type TabKey = "recommend" | "all" | "done";

function fmtExpire(v: string | null): string {
  if (!v) return "无可用时间";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "无可用时间";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function steamCover(appId: number | undefined): string | null {
  return appId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg` : null;
}

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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<TabKey>("all");

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
  const currentGame = currentGames[0];
  const totalCardsRemaining = gamesToFarm.reduce((s, g) => s + (g.CardsRemaining ?? 0), 0);
  const expired = !account.expires_at || new Date(account.expires_at).getTime() < Date.now();

  const recommendGames = gamesToFarm.filter((g) => (g.CardsRemaining ?? 0) > 0);
  const doneGames = gamesToFarm.filter((g) => (g.CardsRemaining ?? 0) === 0);
  const shown = tab === "recommend" ? recommendGames : tab === "done" ? doneGames : gamesToFarm;
  const currentAppIds = new Set(currentGames.map((g) => g.AppID));
  const selectedCount = [...selected].filter((appId) => gamesToFarm.some((g) => g.AppID === appId)).length;

  // 挂时长会话展示数据
  const sessionAppIds = session?.app_ids ?? [];
  const sessionSeconds = session ? Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000)) : 0;
  const playAppNames: Record<number, string | undefined> = {};
  for (const g of currentGames) {
    if (g.AppID !== undefined) playAppNames[g.AppID] = g.GameName;
  }

  function toggleSelect(appId: number | undefined) {
    if (!appId) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(gamesToFarm.slice(0, 32).map((g) => g.AppID).filter((x): x is number => x !== undefined)));
  }
  function clearSelect() {
    setSelected(new Set());
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
          <span className={`expire-chip ${expired ? "warn" : ""}`}>有效至 {fmtExpire(account.expires_at)}</span>
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
        <>
          {/* 挂卡控制中心 */}
          <div className="farm-center">
            <div className="farm-center-head">
              <strong>挂卡控制中心</strong>
              <span className={`farm-state ${nowFarming ? "on" : ""}`}>
                {nowFarming ? "● CardsFarmer 挂卡中" : farmer?.Paused ? "● 已暂停" : "○ 未挂卡"}
              </span>
            </div>

            <div className="farm-now">
              <div className="farm-now-name">{nowFarming && currentGame ? currentGame.GameName : "暂无正在挂卡的游戏"}</div>
              <div className="farm-now-sub">{nowFarming && currentGame ? "当前正在挂取" : "点击下方按钮开始挂卡"}</div>
            </div>

            {/* 自定义显示名称（挂卡模式"正在玩"名称） */}
            <div className="display-name-box" style={{ marginTop: 14 }}>
              <span className="display-name-box-label"><i className="dot" />自定义显示名称（好友看到的"正在玩"文本）</span>
              <input
                value={farmDisplayName}
                onChange={(e) => setFarmDisplayName(e.target.value)}
                placeholder="不填则显示真实游戏名，例如：挂卡中"
                maxLength={60}
              />
              <div className="display-name-actions">
                <button className="btn btn-sm farm-start" onClick={() => void applyFarmDisplayName()} disabled={displayNameBusy}>
                  {displayNameBusy ? "应用中…" : account?.display_name ? "更新显示名称" : "应用显示名称"}
                </button>
                {account?.display_name && (
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => { setFarmDisplayName(""); void applyFarmDisplayName(); }}
                    disabled={displayNameBusy}
                  >
                    清除
                  </button>
                )}
              </div>
              {account?.display_name && (
                <span className="display-name-current">当前名称：<b>{account.display_name}</b></span>
              )}
              <div className="status-hint">
                立即生效需重启 bot（约 10-60 秒），1 小时内最多应用 3 次（与 Steam 状态切换共用限制）。
              </div>
            </div>

            <div className="farm-stats">
              <div className="farm-stat">
                <div className="value">{nowFarming && currentGame ? `${currentGame.CardsRemaining ?? 0} 张` : "—"}</div>
                <div className="label">当前游戏剩余掉落</div>
              </div>
              <div className="farm-stat">
                <div className="value">{gamesToFarm.length}</div>
                <div className="label">队列待挂游戏</div>
              </div>
              <div className="farm-stat">
                <div className="value">{loggedOn ? `${totalCardsRemaining} 张` : "—"}</div>
                <div className="label">待掉落卡牌总数</div>
              </div>
            </div>

            {nowFarming && (
              <div className="farm-tip">
                <div className="farm-tip-line">
                  挂卡进行中：正在挂《{currentGame?.GameName ?? "—"}》（剩余 {currentGame?.CardsRemaining ?? 0} 张卡），
                  队列后还有 {Math.max(gamesToFarm.length - 1, 0)} 个游戏排队，掉落完毕自动切换下一个。
                </div>
                <div className="farm-tip-line">
                  自动过滤：ASF 将自动跳过已掉落完毕的游戏，按顺序挂取共 {gamesToFarm.length} 款待挂游戏。
                </div>
              </div>
            )}
            {!nowFarming && loggedOn && (
              <div className="farm-tip">
                <div className="farm-tip-line">
                  当前未在挂卡。共 {gamesToFarm.length} 款游戏（{totalCardsRemaining} 张卡）待掉落，
                  开始挂卡后将自动按序挂取。
                </div>
              </div>
            )}

            <div className="farm-actions">
              {nowFarming ? (
                <button className="btn farm-stop" onClick={() => void stopFarm()} disabled={busy === "stop"}>
                  {busy === "stop" ? "停止中…" : "停止挂卡"}
                </button>
              ) : (
                <button className="btn farm-start" onClick={() => void startFarm()} disabled={busy === "start" || expired}>
                  {busy === "start" ? "启动中…" : expired ? "无可用时间" : "开始挂卡"}
                </button>
              )}
              {farmer?.TimeRemaining && farmer.TimeRemaining !== "00:00:00" && (
                <span className="farm-eta">预计剩余挂卡时长 {farmer.TimeRemaining}</span>
              )}
            </div>
          </div>

          {/* 我的可掉落游戏库 */}
          <div className="farm-library">
            <div className="lib-head">
              <strong>我的可掉落游戏库</strong>
              <span className="lib-selected">已选 {selectedCount}/{gamesToFarm.length}</span>
            </div>
            <div className="lib-actions">
              <button className="btn btn-sm btn-secondary" onClick={selectAll}>全选(前32个)</button>
              <button className="btn btn-sm btn-secondary" onClick={clearSelect}>清空选择</button>
              <button className="btn btn-sm btn-secondary" onClick={() => void load()} disabled={refreshing}>
                {refreshing ? "刷新中…" : "刷新库存"}
              </button>
            </div>
            <div className="lib-tabs">
              <button className={`lib-tab ${tab === "recommend" ? "active" : ""}`} onClick={() => setTab("recommend")}>
                待挂取推荐({recommendGames.length})
              </button>
              <button className={`lib-tab ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>
                全部游戏({gamesToFarm.length})
              </button>
              <button className={`lib-tab ${tab === "done" ? "active" : ""}`} onClick={() => setTab("done")}>
                充分游玩/已集齐({doneGames.length})
              </button>
            </div>

            {gamesToFarm.length === 0 ? (
              <div className="hint" style={{ margin: "16px 0" }}>
                {loggedOn ? "暂无可掉落游戏（无卡牌掉落剩余）。" : "账号尚未登录，登录后可查看可掉落游戏库。"}
              </div>
            ) : shown.length === 0 ? (
              <div className="hint" style={{ margin: "16px 0" }}>该分类下暂无游戏。</div>
            ) : (
              <div className="game-grid">
                {shown.map((g) => {
                  const appId = g.AppID;
                  const farming = currentAppIds.has(appId);
                  const checked = appId !== undefined && selected.has(appId);
                  const cover = steamCover(appId);
                  const remaining = g.CardsRemaining ?? 0;
                  return (
                    <div key={appId} className={`game-card ${farming ? "farming" : ""}`} onClick={() => toggleSelect(appId)}>
                      {cover ? (
                        <img className="game-cover" src={cover} alt={g.GameName ?? "game"} loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="game-cover game-cover-fallback">{g.GameName?.slice(0, 2) ?? "?"}</div>
                      )}
                      <div className="game-check" onClick={(e) => { e.stopPropagation(); toggleSelect(appId); }}>
                        {checked && <span>✓</span>}
                      </div>
                      <div className="game-info">
                        <div className="game-name" title={g.GameName}>{g.GameName ?? `AppID ${appId ?? "?"}`}</div>
                        <div className="game-meta">
                          {farming ? (
                            <span className="tag tag-farming">挂卡中 · 剩 {remaining} 张</span>
                          ) : remaining > 0 ? (
                            <span className="tag tag-pending">待挂取 · 剩 {remaining} 张</span>
                          ) : (
                            <span className="tag tag-done">√ 掉落已完成</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="hint" style={{ marginTop: 12, fontSize: 12 }}>
              选择为本地标记（仅用于快速筛选参考），ASF 挂卡队列自动按序处理全部待挂游戏，无需手动选择。
            </div>
          </div>
        </>
      ) : (
        /* 挂时长模式 */
        <div className="farm-center">
          <div className="farm-center-head">
            <strong>挂时长控制中心</strong>
            <span className={`farm-state ${session ? "on" : ""}`}>
              {session ? `● 挂时长中（${sessionAppIds.length} 个 APPID）` : "○ 未挂时长"}
            </span>
          </div>

          {session ? (
            <>
              <div className="farm-now">
                <div className="farm-now-name">
                  {sessionAppIds.length > 0 ? `正在挂 ${sessionAppIds.length} 款游戏（AppID ${sessionAppIds.join("、")}）` : "挂时长中"}
                </div>
                <div className="farm-now-sub">
                  {session.status === "pending"
                    ? "正在重启 bot 应用 Steam 状态（约 10-60 秒），登录后自动开始挂时长…"
                    : `已挂 ${fmtDuration(sessionSeconds)}，切换回挂卡模式前持续保持`}
                </div>
              </div>

              <div className="farm-stats">
                <div className="farm-stat">
                  <div className="value">{sessionAppIds.length}</div>
                  <div className="label">挂载游戏数</div>
                </div>
                <div className="farm-stat">
                  <div className="value">{session.status === "pending" ? "—" : fmtDuration(sessionSeconds)}</div>
                  <div className="label">已挂时长</div>
                </div>
                <div className="farm-stat">
                  <div className="value">
                    {session.status === "pending"
                      ? "重启中"
                      : session.online_status === 1
                        ? "正在游戏中"
                        : "离线"}
                  </div>
                  <div className="label">Steam 状态</div>
                </div>
              </div>

              {sessionAppIds.length > 0 && (
                <div className="game-grid" style={{ marginBottom: 16 }}>
                  {sessionAppIds.map((appId) => {
                    const cover = steamCover(appId);
                    const name = playAppNames[appId];
                    return (
                      <div key={appId} className="game-card farming">
                        {cover ? (
                          <img className="game-cover" src={cover} alt={`AppID ${appId}`} loading="lazy"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="game-cover game-cover-fallback">#{String(appId).slice(0, 2)}</div>
                        )}
                        <div className="game-info">
                          <div className="game-name" title={name ?? `AppID ${appId}`}>{name ?? `AppID ${appId}`}</div>
                          <div className="game-meta"><span className="tag tag-farming">挂时长中</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="farm-tip">
                <div className="farm-tip-line">
                  {session.status === "pending"
                    ? "正在切换 Steam 状态并重启 bot，期间挂时长尚未开始，请稍候自动开始…"
                    : "当前处于挂时长模式：bot 将持续游玩上述游戏，不会掉落卡牌。想恢复自动挂卡，请切换到「挂卡模式」。"}
                </div>
                {session.display_name && (
                  <div className="farm-tip-line">当前显示名称：{session.display_name}</div>
                )}
              </div>

              {/* 挂时长进行中：修改显示名称（即时生效） */}
              <div className="display-name-box">
                <span className="display-name-box-label"><i className="dot" />修改显示名称（好友看到的"正在玩"文本）</span>
                <input
                  value={playDisplayName}
                  onChange={(e) => setPlayDisplayName(e.target.value)}
                  placeholder={session.display_name ?? "不填则显示真实游戏名"}
                  maxLength={60}
                />
                <div className="display-name-actions">
                  <button className="btn btn-sm farm-start" onClick={() => void updatePlayName()} disabled={playBusy}>
                    {playBusy ? "更新中…" : "更新显示名称"}
                  </button>
                </div>
                {session.display_name && (
                  <span className="display-name-current">当前名称：<b>{session.display_name}</b></span>
                )}
                <div className="status-hint">重新应用即时生效，不消耗切换次数。</div>
              </div>

              <div className="farm-actions">
                <button className="btn farm-stop" onClick={() => void cancelPlay()} disabled={playBusy}>
                  {playBusy ? "处理中…" : "结束挂时长"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="farm-now">
                <div className="farm-now-name">填写游戏 APPID 开始挂时长</div>
                <div className="farm-now-sub">填写后点击下方「应用」，bot 将持续游玩指定游戏</div>
              </div>

              <div className="farm-stats">
                <div className="farm-stat">
                  <div className="value">≤ 32</div>
                  <div className="label">最多 APPID 数</div>
                </div>
                <div className="farm-stat">
                  <div className="value">—</div>
                  <div className="label">挂载游戏数</div>
                </div>
                <div className="farm-stat">
                  <div className="value">{playStatus === 1 ? "正在游戏中" : "离线"}</div>
                  <div className="label">Steam 状态</div>
                </div>
              </div>

              {/* Steam 状态选择 */}
              <div className="status-select">
                <span className="status-select-label">Steam 状态</span>
                <div className="status-opts">
                  <button
                    type="button"
                    className={`status-opt ${playStatus === 0 ? "active" : ""}`}
                    onClick={() => setPlayStatus(0)}
                  >
                    离线
                  </button>
                  <button
                    type="button"
                    className={`status-opt ${playStatus === 1 ? "active" : ""}`}
                    onClick={() => setPlayStatus(1)}
                  >
                    正在游戏中
                  </button>
                </div>
                <div className="status-hint">
                  由于机制限制，1 小时内最多切换 3 次 Steam 状态（切换将重启 bot，需等待数十秒）。
                </div>
              </div>

              {/* 挂时长自定义显示名称（可选） */}
              <div className="display-name-box">
                <span className="display-name-box-label"><i className="dot" />自定义显示名称（可选，好友看到的"正在玩"文本）</span>
                <input
                  value={playDisplayName}
                  onChange={(e) => setPlayDisplayName(e.target.value)}
                  placeholder="不填则显示真实游戏名"
                  maxLength={60}
                />
                <div className="status-hint">随「应用」一起生效；挂时长期间也可随时修改（重新应用即时生效，不消耗切换次数）。</div>
              </div>

              {!loggedOn && (
                <div className="farm-tip">
                  <div className="farm-tip-line">
                    当前 bot 尚未登录 Steam。请先在「挂卡模式」中点击「开始挂卡」完成登录，再回来挂时长。
                  </div>
                </div>
              )}

              <div className="play-input-box">
                <textarea
                  className="play-input"
                  placeholder="例如：730, 480, 570"
                  value={playInput}
                  onChange={(e) => setPlayInput(e.target.value)}
                  rows={3}
                />
                <div className="play-hint">
                  填写 Steam 游戏 APPID（多个用逗号分隔，最多 32 个）即可开始挂时长；查询 APPID 请访问 steamui.com
                </div>
              </div>

              {playMsg && <div className="ok" style={{ marginBottom: 12 }}>{playMsg}</div>}
              {playErr && <div className="err" style={{ marginBottom: 12 }}>{playErr}</div>}

              <div className="farm-actions">
                <button className="btn farm-start" onClick={() => void applyPlay()} disabled={playBusy || expired}>
                  {playBusy ? "应用中…" : expired ? "无可用时间" : "应用并开始挂时长"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
