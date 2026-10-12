// 服务器视图（普通用户）：命令控制台 + 实时日志轮询
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, postJson, ApiError } from "../lib/api";
import LogViewer from "../components/LogViewer";

interface ServerView {
  id: number;
  name: string;
  status: string;
  bot_count: number;
}

export default function ServerView() {
  const { id } = useParams();
  const serverId = Number(id);
  const [server, setServer] = useState<ServerView | null>(null);
  const [command, setCommand] = useState("");
  const [cmdResult, setCmdResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setServer(await api<ServerView>(`/api/servers/${serverId}`));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [serverId]);

  async function runCommand(e: React.FormEvent) {
    e.preventDefault();
    setCmdResult("");
    setError("");
    const cmd = command.trim();
    if (!cmd) return;
    try {
      const data = await postJson<{ output?: string } | string>(`/api/proxy/${serverId}/Api/Command`, { Command: cmd });
      setCmdResult(typeof data === "string" ? data : data.output ?? JSON.stringify(data));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "命令执行失败");
    }
  }

  if (error) return <div className="err">{error} <Link to="/console">返回</Link></div>;
  if (!server) return <div className="center">加载中…</div>;

  return (
    <div>
      <h1>{server.name}</h1>
      <div className="sub">
        <span className={`badge ${server.status === "online" ? "badge-online" : "badge-offline"}`}>{server.status}</span>
        {" "}账号数 {server.bot_count}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>命令控制台</h2>
        <form onSubmit={runCommand} style={{ display: "flex", gap: 8 }}>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="例如: !status 或 status ASF"
            style={{ flex: 1 }}
          />
          <button className="btn btn-sm" type="submit" style={{ marginTop: 0 }}>执行</button>
        </form>
        {cmdResult && (
          <pre className="logbox" style={{ height: 160, marginTop: 10, color: "#c9d4e3" }}>{cmdResult}</pre>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <LogViewer serverId={serverId} />
      </div>

      <p style={{ marginTop: 12 }}>
        <Link to="/console" style={{ fontSize: 13 }}>← 返回控制台</Link>
      </p>
    </div>
  );
}
