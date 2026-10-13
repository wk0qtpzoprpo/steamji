// 挂卡模式面板：控制中心 + 显示名称 + 统计 + 动作 + 可掉落游戏库
import GameLibrary from "./GameLibrary";
import type { Account, BotObj } from "./types";

interface Props {
  account: Account;
  bot: BotObj | null;
  nowFarming: boolean;
  loggedOn: boolean;
  expired: boolean;
  farmDisplayName: string;
  setFarmDisplayName: (v: string) => void;
  displayNameBusy: boolean;
  busy: "start" | "stop" | "del" | null;
  refreshing: boolean;
  onStart: () => void;
  onStop: () => void;
  onApplyName: () => void;
  onRefresh: () => void;
  onBack: () => void;
  onUnbind: () => void;
}

export default function FarmModePanel({
  account, bot, nowFarming, loggedOn, expired,
  farmDisplayName, setFarmDisplayName, displayNameBusy, busy, refreshing,
  onStart, onStop, onApplyName, onRefresh, onBack, onUnbind,
}: Props) {
  const farmer = bot?.CardsFarmer;
  const gamesToFarm = farmer?.GamesToFarm ?? [];
  const currentGames = farmer?.CurrentGamesFarming ?? [];
  const currentGame = currentGames[0];
  const totalCardsRemaining = gamesToFarm.reduce((s, g) => s + (g.CardsRemaining ?? 0), 0);
  const currentAppIds = new Set(currentGames.map((g) => g.AppID).filter((x): x is number => x !== undefined));

  return (
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
            <button className="btn btn-sm farm-start" onClick={onApplyName} disabled={displayNameBusy}>
              {displayNameBusy ? "应用中…" : account?.display_name ? "更新显示名称" : "应用显示名称"}
            </button>
            {account?.display_name && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => { setFarmDisplayName(""); onApplyName(); }}
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
            <button className="btn farm-stop" onClick={onStop} disabled={busy === "stop"}>
              {busy === "stop" ? "停止中…" : "停止挂卡"}
            </button>
          ) : (
            <button className="btn farm-start" onClick={onStart} disabled={busy === "start" || expired}>
              {busy === "start" ? "启动中…" : expired ? "无可用时间" : "开始挂卡"}
            </button>
          )}
          {farmer?.TimeRemaining && farmer.TimeRemaining !== "00:00:00" && (
            <span className="farm-eta">预计剩余挂卡时长 {farmer.TimeRemaining}</span>
          )}
        </div>
      </div>

      {/* 我的可掉落游戏库 */}
      <GameLibrary
        gamesToFarm={gamesToFarm}
        currentAppIds={currentAppIds}
        loggedOn={loggedOn}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </>
  );
}
