// 统一轮询 hook：失败指数退避、页面隐藏暂停、卸载清理、暂停开关
// 收敛 LogViewer 等各页面散落的 setInterval 轮询实现
import { useEffect, useRef, useState } from "react";

export interface UsePollingOptions {
  /** 轮询周期毫秒（必填由第二个参数传入） */
  /** 页面隐藏时暂停（默认 true） */
  pauseWhenHidden?: boolean;
  /** 失败时指数退避（默认 true） */
  backoff?: boolean;
  /** 立即执行第一轮（默认 true） */
  immediate?: boolean;
  /** 退避上限毫秒（默认 30000） */
  maxBackoffMs?: number;
}

export function usePolling(
  fn: () => Promise<void>,
  intervalMs: number,
  opts: UsePollingOptions = {}
) {
  const { pauseWhenHidden = true, backoff = true, immediate = true, maxBackoffMs = 30000 } = opts;
  const [paused, setPaused] = useState(false);
  const [lastError, setLastError] = useState("");

  // fn 经 ref 持有，避免每次渲染重建 effect；失败时由调用方 throw 触发退避
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const pausedRef = useRef(false);
  const failRef = useRef(0);

  useEffect(() => {
    pausedRef.current = false;
    setPaused(false);
    failRef.current = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function run() {
      if (stopped || pausedRef.current || (pauseWhenHidden && document.visibilityState === "hidden")) {
        schedule();
        return;
      }
      try {
        await fnRef.current();
        failRef.current = 0;
        setLastError("");
      } catch {
        failRef.current = Math.min(failRef.current + 1, 6);
        setLastError("请求失败，正在重试…");
      }
      schedule();
    }

    function schedule() {
      if (stopped) return;
      let delay = intervalMs;
      if (backoff && failRef.current > 0) {
        delay = Math.min(intervalMs * Math.pow(2, failRef.current), maxBackoffMs);
      }
      timer = setTimeout(() => void run(), delay);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void run();
    }
    document.addEventListener("visibilitychange", onVisibility);

    if (immediate) void run();
    else schedule();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, pauseWhenHidden, backoff, immediate, maxBackoffMs]);

  function togglePause() {
    setPaused((p) => {
      pausedRef.current = !p;
      return !p;
    });
  }

  return { paused, lastError, togglePause };
}
