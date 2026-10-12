// 教程页：参照 g.77key 首页「特性 + FAQ」结构，结合本程序实际功能
import { useState } from "react";

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "绑定需要 Steam 密码吗？会被保存吗？",
    a: "需要密码用于登录 Steam。密码经 AES-GCM 加密后存储，服务端不保存明文；该密码仅用于 ASF 登录，不会用于其他用途。",
  },
  {
    q: "登录时提示需要输入邮箱令牌 / Steam 令牌怎么办？",
    a: "这是 Steam 的安全验证。若你的账号启用了 Steam 邮箱验证或手机令牌，ASF 登录时会要求输入对应的令牌，输入后继续即可。若未启用手机令牌，则不会出现扫码/令牌登录选项，直接密码登录即可。",
  },
  {
    q: "挂卡是如何工作的？掉完卡会怎样？",
    a: "ASF 会读取账号中“有卡可掉”的游戏并逐个游玩，卡牌掉落完毕后自动切换到下一款；当所有游戏都已掉完卡，挂机自动停止，账号保持登录在线。",
  },
  {
    q: "账号卡片左上角的灯是什么意思？",
    a: (
      <span>
        <span className="dot online" /> 绿色 = 已登录（Steam 在线）；<span className="dot offline" /> 红色 = 离线（未登录或已停止）；<span className="dot pending" /> 灰色 = 准备中（正在创建 / 正在登录）。
      </span>
    ),
  },
  {
    q: "时长到期后账号会怎样？",
    a: "到期后仅停止挂机（并停止登录），账号与配置全部保留；在「兑换卡密」续费对应栏位后，该账号自动恢复挂卡，无需重新设置。",
  },
  {
    q: "卡密可以叠加吗？可以给空栏位用吗？",
    a: "可以。兑换从该栏位当前到期时间（或今天）起向后累加；空栏位也可直接续费，之后添加的新账号自动继承该栏位时长。",
  },
  {
    q: "挂时长最多可以挂几个游戏？",
    a: "最多 32 款（Steam 上限），同一时间全部计入时长。",
  },
  {
    q: "切换在线状态 / 自定义名称有什么限制？",
    a: "切换 Steam 状态会重启 bot（需等待几十秒），因此 1 小时内最多切换 3 次；挂时长模式中更新“正在玩”名称即时生效、不消耗次数，挂卡模式修改名称需重启 bot，同样受 1 小时 3 次限制。",
  },
  {
    q: "我在其他设备登录同一个 Steam 账号会怎样？",
    a: "同一 Steam 账号无法同时在两处保持在线。请先在本平台停止该账号的挂机，再在其他设备登录，避免互相顶下线。",
  },
  {
    q: "购买卡密后多久生效？",
    a: "兑换即时生效，页面会显示栏位新的到期时间。",
  },
];

function FaqItem({ q, a, open, onToggle }: { q: string; a: React.ReactNode; open: boolean; onToggle: () => void }) {
  return (
    <div className={`faq-item ${open ? "open" : ""}`}>
      <button className="faq-q" onClick={onToggle} type="button">
        <span>{q}</span>
        <span className="faq-arrow">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="faq-a">{a}</div>}
    </div>
  );
}

export default function Tutorial() {
  const [openIdx, setOpenIdx] = useState<number>(0);

  return (
    <div className="page-card tutorial">
      <div className="tutorial-hero">
        <h1>Steam 云挂卡 · 使用教程</h1>
        <p>7×24 小时云端挂卡 / 挂时长，无需开机，注册兑换卡密即可使用。</p>
      </div>

      <h2 className="tutorial-h2">平台特性</h2>
      <div className="feature-grid">
        <div className="feature-card"><div className="feature-title">云端 7×24 挂机</div><div className="feature-desc">账号托管在云端 ASF 服务器全天候在线，无需开电脑、无需自己安装 ASF，关机睡觉照样累计时长、掉落卡牌。</div></div>
        <div className="feature-card"><div className="feature-title">自动掉卡</div><div className="feature-desc">基于 ASF 成熟算法自动轮换有卡可掉的游戏，掉完自动切换下一款，无需手动干预。</div></div>
        <div className="feature-card"><div className="feature-title">一键挂时长</div><div className="feature-desc">填入游戏 APPID（最多 32 款）即可累计指定游戏时长，支持「离线 / 正在游戏中」两种 Steam 状态。</div></div>
        <div className="feature-card"><div className="feature-title">自定义显示名称</div><div className="feature-desc">好友列表中看到的“正在玩”名称可自定义，挂卡与挂时长模式均支持。</div></div>
        <div className="feature-card"><div className="feature-title">多服务器自动调度</div><div className="feature-desc">添加账号时自动分配到当前在线且账号数最少的服务器，无需关心后端细节。</div></div>
        <div className="feature-card"><div className="feature-title">账号安全</div><div className="feature-desc">Steam 密码经 AES-GCM 加密后存储，仅用于登录 Steam，明文不落库。</div></div>
      </div>

      <h2 className="tutorial-h2">快速开始（四步上手）</h2>
      <ol className="step-list">
        <li className="step-card">
          <span className="step-num">1</span>
          <div className="step-body"><div className="step-title">注册登录</div><div className="step-desc">注册账号，登录后进入「我的账号」。</div></div>
        </li>
        <li className="step-card">
          <span className="step-num">2</span>
          <div className="step-body"><div className="step-title">添加 Steam 账号</div><div className="step-desc">填写 bot 名称、Steam 用户名、密码，并选择登录 Steam 后的在线状态。系统自动把账号分配到在线且账号数最少的服务器。新注册用户默认可添加 2 个账号，初始状态为「无可用时间」。</div></div>
        </li>
        <li className="step-card">
          <span className="step-num">3</span>
          <div className="step-body"><div className="step-title">兑换卡密</div><div className="step-desc">前往「兑换卡密」，输入卡密并为指定栏位延长使用时间。卡密为月卡制，每个卡密仅可使用一次；从该栏位当前到期（或今天）起向后延长，可重复累积。</div></div>
        </li>
        <li className="step-card">
          <span className="step-num">4</span>
          <div className="step-body">
            <div className="step-title">开始挂卡 / 挂时长</div>
            <div className="step-desc">点击账号卡片上的「开始挂卡」，按 ASF 反馈完成登录（可能需要输入邮箱令牌或 Steam 令牌）；登录成功后：</div>
            <ul className="step-sub">
              <li><strong>挂卡模式</strong>（默认）：自动轮换有卡可掉的游戏，掉完自动切换。</li>
              <li><strong>挂时长模式</strong>：填写游戏 APPID（可多个，最多 32 个）后点击应用，开始累计指定游戏时长；可切换 Steam 状态（离线 / 正在游戏中）并自定义“正在玩”名称。</li>
            </ul>
          </div>
        </li>
      </ol>

      <h2 className="tutorial-h2">常见问题（FAQ）</h2>
      <div className="tutorial-faq">
        {FAQS.map((f, i) => (
          <FaqItem key={i} q={f.q} a={f.a} open={openIdx === i} onToggle={() => setOpenIdx(openIdx === i ? -1 : i)} />
        ))}
      </div>

      <p className="tutorial-foot">* 本平台与 Valve Corporation 无关，Steam 及相关标识为 Valve Corporation 的商标。</p>
    </div>
  );
}
