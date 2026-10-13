// 可掉落游戏库（挂卡模式下）：tab 筛选 + 本地选择标记（仅 UI 用，不影响 ASF 队列）
import { useState } from "react";
import { steamCover } from "../../lib/format";
import type { FarmGame, TabKey } from "./types";

interface Props {
  gamesToFarm: FarmGame[];
  currentAppIds: Set<number>;
  loggedOn: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

export default function GameLibrary({ gamesToFarm, currentAppIds, loggedOn, refreshing, onRefresh }: Props) {
  const [tab, setTab] = useState<TabKey>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const recommendGames = gamesToFarm.filter((g) => (g.CardsRemaining ?? 0) > 0);
  const doneGames = gamesToFarm.filter((g) => (g.CardsRemaining ?? 0) === 0);
  const shown = tab === "recommend" ? recommendGames : tab === "done" ? doneGames : gamesToFarm;
  const selectedCount = [...selected].filter((appId) => gamesToFarm.some((g) => g.AppID === appId)).length;

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
    <div className="farm-library">
      <div className="lib-head">
        <strong>我的可掉落游戏库</strong>
        <span className="lib-selected">已选 {selectedCount}/{gamesToFarm.length}</span>
      </div>
      <div className="lib-actions">
        <button className="btn btn-sm btn-secondary" onClick={selectAll}>全选(前32个)</button>
        <button className="btn btn-sm btn-secondary" onClick={clearSelect}>清空选择</button>
        <button className="btn btn-sm btn-secondary" onClick={onRefresh} disabled={refreshing}>
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
            const farming = appId !== undefined && currentAppIds.has(appId);
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
  );
}
