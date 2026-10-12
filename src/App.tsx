import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { hasToken } from "./lib/api";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Renew from "./pages/Renew";
import Console from "./pages/Console";
import AccountDetail from "./pages/AccountDetail";
import AddAccount from "./pages/AddAccount";
import Redeem from "./pages/Redeem";
import ChangePassword from "./pages/ChangePassword";
import ServerView from "./pages/ServerView";
import Tutorial from "./pages/Tutorial";
import AdminServers from "./pages/AdminServers";
import AdminServerDetail from "./pages/AdminServerDetail";
import AdminAnnouncements from "./pages/AdminAnnouncements";
import AdminCards from "./pages/AdminCards";
import AdminUsers from "./pages/AdminUsers";
import AdminSettings from "./pages/AdminSettings";

function Protected({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { me, loading, reload } = useAuth();
  if (loading) return <div className="center">加载中…</div>;
  // token 仍有效但用户信息未加载成功（网络/服务瞬时故障）：给重试入口，不误弹登录页
  if (!me && hasToken()) {
    return (
      <div className="center">
        <div style={{ marginBottom: 14, color: "var(--muted)" }}>连接中断，正在尝试重新连接…</div>
        <button className="btn" onClick={() => void reload()}>重新加载</button>
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;
  if (adminOnly && me.user.role !== "admin") return <Navigate to="/console" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/renew" element={<Renew />} />
      <Route path="/console" element={<Protected><Console /></Protected>} />
      <Route path="/console/accounts/:id" element={<Protected><AccountDetail /></Protected>} />
      <Route path="/console/add" element={<Protected><AddAccount /></Protected>} />
      <Route path="/console/redeem" element={<Protected><Redeem /></Protected>} />
      <Route path="/console/password" element={<Protected><ChangePassword /></Protected>} />
      <Route path="/console/servers/:id" element={<Protected><ServerView /></Protected>} />
      <Route path="/tutorial" element={<Protected><Tutorial /></Protected>} />
      <Route path="/admin/servers" element={<Protected adminOnly><AdminServers /></Protected>} />
      <Route path="/admin/servers/:id" element={<Protected adminOnly><AdminServerDetail /></Protected>} />
      <Route path="/admin/announcements" element={<Protected adminOnly><AdminAnnouncements /></Protected>} />
      <Route path="/admin/cards" element={<Protected adminOnly><AdminCards /></Protected>} />
      <Route path="/admin/users" element={<Protected adminOnly><AdminUsers /></Protected>} />
      <Route path="/admin/settings" element={<Protected adminOnly><AdminSettings /></Protected>} />
      <Route path="/" element={<Navigate to="/console" replace />} />
      <Route path="*" element={<Navigate to="/console" replace />} />
    </Routes>
  );
}
