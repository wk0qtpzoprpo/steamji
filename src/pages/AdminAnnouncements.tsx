// 公告管理（仅管理员）：发布/删除纯文字公告
import { useEffect, useState } from "react";
import { api, postJson, del, ApiError } from "../lib/api";

interface Announcement {
  id: number;
  content: string;
  created_at: string;
}

export default function AdminAnnouncements() {
  const [list, setList] = useState<Announcement[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  function load() {
    api<Announcement[]>("/api/admin/announcements").then(setList).catch(() => setList([]));
  }
  useEffect(load, []);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOkMsg("");
    if (!content.trim()) {
      setError("公告内容不能为空");
      return;
    }
    setLoading(true);
    try {
      await postJson("/api/admin/announcements", { content });
      setContent("");
      setOkMsg("公告已发布");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "发布失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("确定删除这条公告？")) return;
    setError("");
    setOkMsg("");
    try {
      await del(`/api/admin/announcements/${id}`);
      setOkMsg("公告已删除");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "删除失败，请重试");
    }
  }

  return (
    <div className="page-card">
      <h1>公告管理</h1>
      <form className="form" onSubmit={publish} style={{ marginLeft: 0 }}>
        <label>发布公告（纯文字，最多 500 字）</label>
        <textarea
          className="input"
          value={content}
          rows={3}
          maxLength={500}
          placeholder="输入公告内容，用户端顶部栏将展示最新公告…"
          onChange={(e) => setContent(e.target.value)}
        />
        {error && <div className="err">{error}</div>}
        {okMsg && <div className="ok">{okMsg}</div>}
        <button className="btn" disabled={loading || !content.trim()}>
          {loading ? "发布中…" : "发布公告"}
        </button>
      </form>

      <h2 className="admin-sub">已发布公告（{list.length}）</h2>
      {list.length === 0 ? (
        <div className="hint">暂无公告</div>
      ) : (
        <div className="ann-list">
          {list.map((a) => (
            <div key={a.id} className="ann-row">
              <div className="ann-body">
                <div className="ann-text">{a.content}</div>
                <div className="ann-time">{a.created_at?.replace("T", " ").slice(0, 16)}</div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => void remove(a.id)}>删除</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
