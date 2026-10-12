// 日志轮询组件：轮询 /Api/NLog/File，增量渲染，轮转防护，错误退避
import { useEffect, useRef, useState } from "react";
import { apiRaw } from "../lib/api";

const MAX_LINES = 1000;

export default function LogViewer({ serverId }: { serverId: number }) {
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [lastError, setLastError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef(true);
  const lastLengthRef = useRef(0);
  const seenRef = useRef(new Set<string>());
  const pauseRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failCount = 0;
    let stopped = false;

    async function poll() {
      if (stopped || pauseRef.current || document.visibilityState === "hidden") {
        schedule();
        return;
      }
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
          const key = line;
          if (!key) continue;
          if (!seenRef.current.has(key)) {
            seenRef.current.add(key);
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
        failCount = 0;
        setLastError("");
      } catch {
        failCount = Math.min(failCount + 1, 6);
        setLastError("日志获取失败，正在重试…");
      }
      schedule();
    }

    function schedule() {
      if (stopped) return;
      const delay = failCount === 0 ? 3000 : Math.min(3000 * Math.pow(2, failCount), 30000);
      timer = setTimeout(() => void poll(), delay);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void poll();
    }
    document.addEventListener("visibilitychange", onVisibility);

    void poll();

    return () => {
      stopped = true;
      mountedRef.current = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  function onScroll() {
    const el = boxRef.current;
    if (!el) return;
    stickyRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  function togglePause() {
    setPaused((p) => {
      pauseRef.current = !p;
      return !p;
    });
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
        {lastError && <span style={{ color: "var(--danger)", fontSize: 12 }}>{lastError}</span>}
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
