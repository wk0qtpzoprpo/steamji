// 日志轮询组件：轮询 /Api/NLog/File，增量渲染，轮转防护
// 轮询调度（退避/隐藏暂停/暂停开关）统一由 usePolling 承担
import { useEffect, useRef, useState } from "react";
import { apiRaw } from "../lib/api";
import { usePolling } from "../hooks/usePolling";

const MAX_LINES = 1000;

export default function LogViewer({ serverId }: { serverId: number }) {
  const [lines, setLines] = useState<string[]>([]);
  const [pollErr, setPollErr] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef(true);
  const lastLengthRef = useRef(0);
  const seenRef = useRef(new Set<string>());

  const { paused, togglePause } = usePolling(
    async () => {
      try {
        const resp = await apiRaw(`/api/proxy/${serverId}/NLog/File`, { method: "GET" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        const linesArr = text.split("\n");
        // 轮转检测：新内容比上次短 → 重置
        if (text.length < lastLengthRef.current) {
          lastLengthRef.current = 0;
          seenRef.current = new Set();
          setLines([]);
        }
        lastLengthRef.current = text.length;

        const fresh: string[] = [];
        for (const line of linesArr.slice(0, MAX_LINES)) {
          if (!line) continue;
          if (!seenRef.current.has(line)) {
            seenRef.current.add(line);
            fresh.push(line);
          }
        }
        // 控制 seen 集合大小
        if (seenRef.current.size > 10000) seenRef.current = new Set([...seenRef.current].slice(-5000));
        if (fresh.length > 0) {
          setLines((prev) => {
            const next = [...prev, ...fresh];
            return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
          });
          requestAnimationFrame(() => {
            if (stickyRef.current && boxRef.current) {
              boxRef.current.scrollTop = boxRef.current.scrollHeight;
            }
          });
        }
        setPollErr("");
      } catch {
        setPollErr("日志获取失败，正在重试…");
        throw new Error("poll failed"); // 触发 usePolling 指数退避
      }
    },
    3000,
    { pauseWhenHidden: true, backoff: true, immediate: true }
  );

  // 切换服务器时重置日志状态
  useEffect(() => {
    lastLengthRef.current = 0;
    seenRef.current = new Set();
    setLines([]);
    setPollErr("");
  }, [serverId]);

  function onScroll() {
    const el = boxRef.current;
    if (!el) return;
    stickyRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>实时日志</span>
        <span className="badge badge-muted">轮询模式（3 秒）</span>
        <button className="btn btn-sm btn-secondary" onClick={togglePause}>
          {paused ? "继续" : "暂停"}
        </button>
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => {
            setLines([]);
            lastLengthRef.current = 0;
            seenRef.current = new Set();
          }}
        >
          清空
        </button>
        {pollErr && <span style={{ color: "var(--danger)", fontSize: 12 }}>{pollErr}</span>}
      </div>
      <div className="logbox" ref={boxRef} onScroll={onScroll}>
        {lines.length === 0 && <div style={{ color: "#64748b" }}>暂无日志…</div>}
        {lines.map((l, i) => (
          <div className="row" key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}
