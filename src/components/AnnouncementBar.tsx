// 用户端公告栏：顶部横幅展示最新公告，可展开查看全部
import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Announcement {
  id: number;
  content: string;
  created_at: string;
}

export default function AnnouncementBar() {
  const [list, setList] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api<Announcement[]>("/api/announcements")
      .then((rows) => setList(Array.isArray(rows) ? rows : []))
      .catch(() => setList([]));
  }, []);

  if (list.length === 0) {
    return (
      <div className="ann-bar empty">
        <div className="ann-bar-head">
          <span className="ann-bar-icon">📢</span>
          <span className="ann-bar-title">公告</span>
          <span className="ann-bar-text">暂无公告</span>
        </div>
      </div>
    );
  }

  const latest = list[0];

  return (
    <div className={`ann-bar ${open ? "open" : ""}`}>
      <div className="ann-bar-head" onClick={() => setOpen(!open)}>
        <span className="ann-bar-icon">📢</span>
        <span className="ann-bar-title">公告</span>
        <span className="ann-bar-text">{latest.content}</span>
        <span className="ann-bar-toggle">{open ? "收起" : (list.length > 1 ? `展开 ${list.length} 条` : "展开")}</span>
      </div>
      {open && (
        <div className="ann-bar-body">
          {list.map((a) => (
            <div key={a.id} className="ann-bar-item">
              <div className="ann-bar-item-text">{a.content}</div>
              <div className="ann-bar-item-time">{a.created_at?.replace("T", " ").slice(0, 16)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
