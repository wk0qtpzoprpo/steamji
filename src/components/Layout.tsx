// 页面布局：桌面顶部导航 + 移动端侧边抽屉导航
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import AnnouncementBar from "./AnnouncementBar";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { me, logout } = useAuth();
  const isAdmin = me?.user.role === "admin";
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();

  const links = isAdmin
    ? [
        { to: "/admin/servers", label: "服务器" },
        { to: "/admin/announcements", label: "公告" },
        { to: "/admin/cards", label: "卡密" },
        { to: "/admin/users", label: "用户" },
        { to: "/admin/settings", label: "设置" },
        { to: "/console/redeem", label: "兑换卡密" },
        { to: "/console/password", label: "修改密码" },
        { to: "/tutorial", label: "教程" },
      ]
    : [
        { to: "/console", label: "我的账号" },
        { to: "/console/redeem", label: "兑换卡密" },
        { to: "/console/password", label: "修改密码" },
        { to: "/tutorial", label: "教程" },
      ];

  const close = () => setMenuOpen(false);

  return (
    <div>
      {/* 顶部导航（桌面）/ 顶栏（移动） */}
      <nav className="nav">
        <span className="brand">Steam姬</span>
        <div className="nav-links">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className={loc.pathname.startsWith(l.to) ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </div>
        <span className="spacer" />
        <span className="user">{me?.user.username} · {isAdmin ? "管理员" : "普通用户"}</span>
        <button className="logout-btn" onClick={() => void logout()}>退出</button>
        <button className="nav-burger" aria-label="打开菜单" onClick={() => setMenuOpen(true)}>
          <span /> <span /> <span />
        </button>
      </nav>

      {/* 移动端侧边抽屉 */}
      <div className={`drawer-mask ${menuOpen ? "open" : ""}`} onClick={close}>
        <aside className="drawer" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head">
            <span className="brand">Steam姬</span>
            <button className="drawer-close" aria-label="关闭菜单" onClick={close}>✕</button>
          </div>
          <nav className="drawer-nav">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={loc.pathname.startsWith(l.to) ? "active" : ""}
                onClick={close}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="drawer-foot">
            <span className="user">{me?.user.username} · {isAdmin ? "管理员" : "普通用户"}</span>
            <button className="logout-btn" onClick={() => void logout()}>退出登录</button>
          </div>
        </aside>
      </div>

      <div className="page">
        <AnnouncementBar />
        {children}
      </div>
    </div>
  );
}
