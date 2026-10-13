// 挂时长模式面板：进行中（session）与未开始（填 APPID）两种状态
import { fmtDuration, steamCover } from "../../lib/format";
import type { PlaySession } from "./types";

interface Props {
  session: PlaySession | null;
  loggedOn: boolean;
  expired: boolean;
  playInput: string;
  setPlayInput: (v: string) => void;
  playStatus: 0 | 1;
  setPlayStatus: (v: 0 | 1) => void;
  playDisplayName: string;
  setPlayDisplayName: (v: string) => void;
  playMsg: string;
  playErr: string;
  playBusy: boolean;
  sessionAppIds: number[];
  sessionSeconds: number;
  playAppNames: Record<number, string | undefined>;
  onApply: () => void;
  onCancel: () => void;
  onUpdateName: () => void;
}

export default function PlayModePanel({
  session, loggedOn, expired,
  playInput, setPlayInput, playStatus, setPlayStatus,
  playDisplayName, setPlayDisplayName,
  playMsg, playErr, playBusy,
  sessionAppIds, sessionSeconds, playAppNames,
  onApply, onCancel, onUpdateName,
}: Props) {
  return (
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
              <button className="btn btn-sm farm-start" onClick={onUpdateName} disabled={playBusy}>
                {playBusy ? "更新中…" : "更新显示名称"}
              </button>
            </div>
            {session.display_name && (
              <span className="display-name-current">当前名称：<b>{session.display_name}</b></span>
            )}
            <div className="status-hint">重新应用即时生效，不消耗切换次数。</div>
          </div>

          <div className="farm-actions">
            <button className="btn farm-stop" onClick={onCancel} disabled={playBusy}>
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
            <button className="btn farm-start" onClick={onApply} disabled={playBusy || expired}>
              {playBusy ? "应用中…" : expired ? "无可用时间" : "应用并开始挂时长"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
