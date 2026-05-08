import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Database,
  FileText,
  GitBranch,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Network,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  Upload,
  Zap
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_DREAMWEAVE_API || window.location.origin;
const DEFAULT_RESULT = {
  query: "",
  answer: "",
  l1_surface: [],
  l2_associative: [],
  l3_structural: [],
  kick: { fired: false, divergence: 0, severity: "none", message: "No query has been run", threshold: 0.42 },
  kick_reranked_surface: [],
  graph_stats: { nodes: 0, edges: 0, top_entities: [] },
  latency_ms: 0
};
const EMPTY_GRAPH = { nodes: [], edges: [] };

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${path} failed (${response.status}): ${text.slice(0, 240)}`);
  }
  return response.json();
}

function App() {
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem("dreamweave-auth") === "true");
  const [activeSection, setActiveSection] = useState("query");
  const [selectedLayer, setSelectedLayer] = useState("overview");
  const [health, setHealth] = useState(null);
  const [sources, setSources] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [graph, setGraph] = useState(EMPTY_GRAPH);
  const [result, setResult] = useState(DEFAULT_RESULT);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState([]);
  const [kickEnabled, setKickEnabled] = useState(true);
  const [llmOnline, setLlmOnline] = useState(false);

  const addLog = useCallback((message, level = "info") => {
    setLogs((current) => [{ time: new Date().toLocaleTimeString([], { hour12: false }), message, level }, ...current].slice(0, 25));
  }, []);

  const refresh = useCallback(async () => {
    setBooting(true);
    setError("");
    try {
      const [healthData, sourceData, schemaData, graphData] = await Promise.all([
        api("/health"),
        api("/sources"),
        api("/schemas"),
        api("/graph")
      ]);
      setHealth(healthData);
      setSources(Array.isArray(sourceData) ? sourceData : []);
      setSchemas(Array.isArray(schemaData) ? schemaData : []);
      setGraph(normalizeGraph(graphData));
      try {
        const llm = await api("/health/llm");
        setLlmOnline(llm.status === "reachable");
      } catch {
        setLlmOnline(false);
      }
      addLog("Runtime state refreshed", "ok");
    } catch (err) {
      setError(err.message);
      addLog(err.message, "error");
    } finally {
      setBooting(false);
    }
  }, [addLog]);

  useEffect(() => {
    if (authenticated) refresh();
  }, [authenticated, refresh]);

  async function runQuery(event) {
    event?.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    setLoading(true);
    setError("");
    addLog(`Query submitted: ${clean}`, "info");
    try {
      const data = await api("/retrieve", {
        method: "POST",
        body: JSON.stringify({ query: clean, generate_answer: llmOnline, max_tokens: 700, kick_enabled: kickEnabled })
      });
      const nextResult = {
        ...DEFAULT_RESULT,
        ...data,
        answer: data.answer && data.answer !== "Answer generation disabled" ? data.answer : buildRetrievalAnswer(data)
      };
      setResult(nextResult);
      addLog(data.kick?.message || "Layered retrieval completed", data.kick?.fired ? "warn" : "ok");
      const graphData = await api("/graph");
      setGraph(normalizeGraph(graphData));
      const sourceData = await api("/sources");
      setSources(Array.isArray(sourceData) ? sourceData : []);
    } catch (err) {
      setError(err.message);
      addLog(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function ingestText({ source, text }) {
    if (!source.trim() || !text.trim()) return "Source name and text are required.";
    try {
      const data = await api("/ingest", { method: "POST", body: JSON.stringify({ source, text }) });
      addLog(`Ingested ${data.chunks_ingested} chunks from ${source}`, "ok");
      await refresh();
      return `Ingested ${data.chunks_ingested} chunks. Graph: ${data.graph_nodes} nodes, ${data.graph_edges} edges.`;
    } catch (err) {
      setError(err.message);
      addLog(err.message, "error");
      return err.message;
    }
  }

  async function ingestFile(file) {
    if (!file) return "Choose a file first.";
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`${API_BASE}/ingest/file`, { method: "POST", body: form });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      addLog(`Uploaded ${file.name}: ${data.chunks_ingested} chunks`, "ok");
      await refresh();
      return `Uploaded ${file.name}. ${data.chunks_ingested} chunks ingested.`;
    } catch (err) {
      setError(err.message);
      addLog(err.message, "error");
      return err.message;
    }
  }

  const anomalies = useMemo(() => detectAnomalies({ health, sources, graph, result, error, llmOnline }), [health, sources, graph, result, error, llmOnline]);
  const stats = health?.runtime || {};

  if (!authenticated) {
    return <LoginScreen onLogin={() => { sessionStorage.setItem("dreamweave-auth", "true"); setAuthenticated(true); }} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav">
          {[
            ["query", Search, "Query Console"],
            ["ingest", Upload, "Ingest"],
            ["memory", Layers, "Memory Layers"],
            ["graph", Network, "Graph Explorer"],
            ["ops", BarChart3, "Ops & Anomalies"],
            ["settings", Settings, "Settings"]
          ].map(([id, Icon, label]) => (
            <button className={activeSection === id ? "active" : ""} key={id} onClick={() => setActiveSection(id)} type="button">
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <RuntimeCard health={health} llmOnline={llmOnline} />
        <SourceList sources={sources} />
      </aside>

      <main className="workspace">
        <TopBar
          booting={booting}
          error={error}
          llmOnline={llmOnline}
          kickEnabled={kickEnabled}
          setKickEnabled={setKickEnabled}
          refresh={refresh}
        />
        <LayerHeader selectedLayer={selectedLayer} setSelectedLayer={setSelectedLayer} result={result} stats={stats} graph={graph} />
        {activeSection === "query" && <QueryConsole result={result} query={query} setQuery={setQuery} runQuery={runQuery} loading={loading} />}
        {activeSection === "ingest" && <IngestConsole ingestText={ingestText} ingestFile={ingestFile} />}
        {activeSection === "memory" && <MemoryLayers selectedLayer={selectedLayer} setSelectedLayer={setSelectedLayer} result={result} schemas={schemas} stats={stats} sources={sources} graph={graph} />}
        {activeSection === "graph" && <GraphExplorer graph={graph} result={result} />}
        {activeSection === "ops" && <OpsConsole anomalies={anomalies} logs={logs} health={health} result={result} />}
        {activeSection === "settings" && <SettingsConsole apiBase={API_BASE} health={health} refresh={refresh} />}
      </main>

      <aside className="right-rail">
        <MemoryVisualization graph={graph} />
        <AnomalyPanel anomalies={anomalies} logs={logs} />
      </aside>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const expected = import.meta.env.VITE_DREAMWEAVE_ACCESS_CODE || "";
  function submit(event) {
    event.preventDefault();
    if (expected && code !== expected) {
      setError("Invalid access code.");
      return;
    }
    onLogin();
  }
  return (
    <section className="login-screen">
      <div className="login-card">
        <Brand />
        <h2>Secure Memory Console</h2>
        <p>Connect to the live DREAMWEAVE backend. The console only renders runtime data returned by your API.</p>
        <form onSubmit={submit}>
          <label>
            Access Code
            <span><KeyRound size={16} /><input value={code} onChange={(event) => setCode(event.target.value)} placeholder={expected ? "Enter access code" : "No code configured"} type="password" /></span>
          </label>
          {error && <em>{error}</em>}
          <button type="submit"><Lock size={16} /> Enter Console</button>
        </form>
      </div>
    </section>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><span /></div>
      <div><h1>DREAMWEAVE</h1><p>Layered Memory Intelligence</p></div>
    </div>
  );
}

function RuntimeCard({ health, llmOnline }) {
  const runtime = health?.runtime;
  const chunks = health?.l1_stats?.total_chunks ?? 0;
  const nodes = health?.graph_stats?.nodes ?? 0;
  return (
    <section className="runtime-card">
      <div className="runtime-head"><Shield size={18} /><span>Runtime Status</span></div>
      <Metric label="API" value={health ? "ready" : "offline"} tone={health ? "ok" : "bad"} />
      <Metric label="LLM" value={llmOnline ? "online" : "retrieval mode"} tone={llmOnline ? "ok" : "warn"} />
      <Metric label="Chunks" value={chunks} />
      <Metric label="Graph Nodes" value={nodes} />
      <Metric label="Embedding" value={runtime?.embedding_model || "unknown"} compact />
    </section>
  );
}

function SourceList({ sources }) {
  return (
    <section className="source-panel">
      <div className="section-title"><span>Sources</span><strong>{sources.length}</strong></div>
      {sources.length === 0 ? <EmptyState text="No sources ingested yet." /> : sources.slice(0, 10).map((source) => (
        <div className="source-row" key={source.source}>
          <FileText size={16} />
          <span><strong>{source.source}</strong><small>{source.chunks || 0} chunks · {source.kind || "text"}</small></span>
        </div>
      ))}
    </section>
  );
}

function TopBar({ booting, error, llmOnline, kickEnabled, setKickEnabled, refresh }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Production Console</p>
        <h2>Live Cognitive Memory Runtime</h2>
      </div>
      <div className="top-actions">
        <StatusPill tone={error ? "bad" : booting ? "warn" : "ok"} icon={booting ? Loader2 : CircleDot} text={error ? "Attention" : booting ? "Syncing" : "API Ready"} spin={booting} />
        <StatusPill tone={llmOnline ? "ok" : "warn"} icon={BrainCircuit} text={llmOnline ? "LLM Online" : "Retrieval Mode"} />
        <label className="switch-label">Kick <button className={kickEnabled ? "switch" : "switch off"} type="button" onClick={() => setKickEnabled(!kickEnabled)} /></label>
        <button className="icon-button" onClick={refresh} type="button"><RefreshCw size={16} /></button>
      </div>
    </header>
  );
}

function LayerHeader({ selectedLayer, setSelectedLayer, result, stats, graph }) {
  const layers = [
    { id: "overview", label: "Overview", value: `${stats.l1_stats?.total_chunks ?? 0} chunks` },
    { id: "l1", label: "L1 Surface", value: `${result.l1_surface.length} hits` },
    { id: "l2", label: "L2 Associative", value: `${graph.nodes.length} nodes` },
    { id: "l3", label: "L3 Structural", value: result.l3_structural[0]?.name || "no match" },
    { id: "kick", label: "Kick", value: result.kick?.severity || "none" }
  ];
  return (
    <section className="layer-header">
      <label>
        Layer Focus
        <span><select value={selectedLayer} onChange={(event) => setSelectedLayer(event.target.value)}>{layers.map((layer) => <option value={layer.id} key={layer.id}>{layer.label}</option>)}</select><ChevronDown size={16} /></span>
      </label>
      <div className="layer-metrics">
        {layers.slice(1).map((layer) => <div key={layer.id}><strong>{layer.label}</strong><small>{layer.value}</small></div>)}
      </div>
    </section>
  );
}

function QueryConsole({ result, query, setQuery, runQuery, loading }) {
  return (
    <section className="query-console">
      <form className="query-bar" onSubmit={runQuery}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask the live memory system..." />
        <button disabled={loading} type="submit">{loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />} Run</button>
      </form>
      <article className="answer-panel">
        <div className="panel-title"><span><Zap size={16} /> Answer</span><small>{result.latency_ms ? `${(result.latency_ms / 1000).toFixed(2)}s` : "not run"}</small></div>
        {loading ? <Skeleton /> : result.answer ? <p>{result.answer}</p> : <EmptyState text="Run a query to retrieve live layered context." />}
      </article>
      <div className="retrieval-grid">
        <ResultCard title="L1 Surface" tone="blue" count={`${result.l1_surface.length} chunks`} items={result.l1_surface.map((item) => `${item.source}: ${truncate(item.text, 110)}`)} />
        <ResultCard title="L2 Associative" tone="cyan" count={`${result.l2_associative.length} paths`} items={result.l2_associative.map((item) => item.path || item.entity)} />
        <ResultCard title="L3 + Kick" tone={result.kick?.fired ? "pink" : "gold"} count={result.l3_structural[0]?.name || "no schema"} items={[...(result.l3_structural.map((schema) => `${schema.name} · ${Math.round((schema.confidence || 0) * 100)}%`)), result.kick?.message].filter(Boolean)} />
      </div>
    </section>
  );
}

function IngestConsole({ ingestText, ingestFile }) {
  const [source, setSource] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function submitText() {
    setBusy(true);
    setStatus(await ingestText({ source, text }));
    setBusy(false);
  }
  async function submitFile() {
    setBusy(true);
    setStatus(await ingestFile(file));
    setBusy(false);
  }
  return (
    <section className="page-panel">
      <div className="page-head"><div><p className="eyebrow">Memory Intake</p><h2>Ingest Real Knowledge</h2></div><Upload size={24} /></div>
      <div className="ingest-grid">
        <div className="form-card">
          <label>Source Name<input value={source} onChange={(event) => setSource(event.target.value)} placeholder="research_notes.txt" /></label>
          <label>Text<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste source text here..." /></label>
          <button className="primary" disabled={busy} onClick={submitText} type="button">{busy ? <Loader2 className="spin" size={16} /> : <Upload size={16} />} Ingest Text</button>
        </div>
        <div className="form-card">
          <label>Upload File<input onChange={(event) => setFile(event.target.files?.[0] || null)} type="file" /></label>
          <p className="hint">Supports text-like files and PDFs through the backend `/ingest/file` endpoint.</p>
          <button className="primary" disabled={busy || !file} onClick={submitFile} type="button">{busy ? <Loader2 className="spin" size={16} /> : <FileText size={16} />} Ingest File</button>
          {status && <div className="status-message">{status}</div>}
        </div>
      </div>
    </section>
  );
}

function MemoryLayers({ selectedLayer, setSelectedLayer, result, schemas, stats, sources, graph }) {
  const views = {
    overview: <Overview stats={stats} sources={sources} graph={graph} />,
    l1: <LayerDetail title="L1 Surface" text="Vector retrieval over stored chunks." items={result.l1_surface.map((item) => `${item.score}: ${item.source} · ${truncate(item.text, 160)}`)} />,
    l2: <LayerDetail title="L2 Associative" text="Entity and concept graph built from ingested text." items={result.l2_associative.map((item) => item.path || item.entity)} />,
    l3: <LayerDetail title="L3 Structural" text="Schema geometry matches for the latest query." items={(result.l3_structural.length ? result.l3_structural : schemas).map((schema) => `${schema.name}: ${schema.description}`)} />,
    kick: <LayerDetail title="Kick" text="Divergence detector between surface retrieval and structural pattern." items={[result.kick?.message, `divergence=${result.kick?.divergence}`, `threshold=${result.kick?.threshold}`].filter(Boolean)} />
  };
  return (
    <section className="page-panel">
      <div className="page-head"><div><p className="eyebrow">Ordered Layer View</p><h2>Memory Layers</h2></div><select value={selectedLayer} onChange={(event) => setSelectedLayer(event.target.value)}>{Object.keys(views).map((key) => <option key={key} value={key}>{key.toUpperCase()}</option>)}</select></div>
      {views[selectedLayer]}
    </section>
  );
}

function Overview({ stats, sources, graph }) {
  return (
    <div className="overview-grid">
      <MetricBox label="Chunks" value={stats.l1_stats?.total_chunks ?? 0} icon={Database} />
      <MetricBox label="Sources" value={sources.length} icon={FileText} />
      <MetricBox label="Graph Nodes" value={graph.nodes.length} icon={Network} />
      <MetricBox label="Graph Edges" value={graph.edges.length} icon={GitBranch} />
    </div>
  );
}

function GraphExplorer({ graph, result }) {
  return (
    <section className="page-panel graph-page">
      <div className="page-head"><div><p className="eyebrow">Live Memory Graph</p><h2>Graph Explorer</h2></div><Network size={24} /></div>
      <div className="large-graph"><MemoryGraph graph={graph} /></div>
      <ResultCard title="Latest L2 Paths" tone="cyan" count={`${result.l2_associative.length} paths`} items={result.l2_associative.map((item) => item.path || item.entity)} />
    </section>
  );
}

function OpsConsole({ anomalies, logs, health, result }) {
  return (
    <section className="page-panel">
      <div className="page-head"><div><p className="eyebrow">Operational Readiness</p><h2>Errors & Anomalies</h2></div><AlertTriangle size={24} /></div>
      <div className="ops-grid">
        <AnomalyPanel anomalies={anomalies} logs={logs} full />
        <div className="form-card">
          <h3>Runtime Snapshot</h3>
          <Metric label="API Status" value={health ? "ready" : "offline"} />
          <Metric label="Kick Severity" value={result.kick?.severity || "none"} />
          <Metric label="Kick Divergence" value={result.kick?.divergence ?? 0} />
          <Metric label="Memory Dir" value={health?.runtime?.memory_dir || "unknown"} compact />
        </div>
      </div>
    </section>
  );
}

function SettingsConsole({ apiBase, health, refresh }) {
  return (
    <section className="page-panel">
      <div className="page-head"><div><p className="eyebrow">Configuration</p><h2>Settings</h2></div><Settings size={24} /></div>
      <div className="settings-list">
        <Metric label="API Base" value={apiBase} compact />
        <Metric label="LLM URL" value={health?.llm_url || "unknown"} compact />
        <Metric label="LLM Model" value={health?.llm_model || "unknown"} compact />
        <Metric label="Embedding" value={health?.runtime?.embedding_model || "unknown"} compact />
        <button className="primary" onClick={refresh} type="button"><RefreshCw size={16} /> Refresh Runtime</button>
      </div>
    </section>
  );
}

function MemoryVisualization({ graph }) {
  return (
    <section className="visual-panel">
      <div className="rail-head"><span>Memory Visualization</span><strong>{graph.nodes.length} nodes</strong></div>
      <MemoryGraph graph={graph} />
      <div className="legend"><span><i className="entity" />Entity</span><span><i className="concept" />Concept</span><span><i className="date" />Date/Number</span></div>
    </section>
  );
}

function MemoryGraph({ graph }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef([]);
  const frameRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    canvas.height = Math.max(320, Math.floor(rect.height * dpr));
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const previous = new Map(nodesRef.current.map((node) => [node.id, node]));
    nodesRef.current = nodes.map((node, index) => {
      const old = previous.get(node.id);
      const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
      return { ...node, x: old?.x ?? width / 2 + Math.cos(angle) * width * 0.3, y: old?.y ?? height / 2 + Math.sin(angle) * height * 0.3, vx: old?.vx ?? 0, vy: old?.vy ?? 0 };
    });
  }, [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    function draw() {
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const liveNodes = nodesRef.current;
      const byId = new Map(liveNodes.map((node) => [node.id, node]));

      for (let i = 0; i < liveNodes.length; i += 1) {
        for (let j = i + 1; j < liveNodes.length; j += 1) {
          const a = liveNodes[i];
          const b = liveNodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const force = 190 / Math.max(120, dx * dx + dy * dy);
          a.vx += dx * force;
          a.vy += dy * force;
          b.vx -= dx * force;
          b.vy -= dy * force;
        }
      }

      for (const edge of edges) {
        const a = byId.get(edge.source);
        const b = byId.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const pull = (dist - 110) * 0.0009;
        a.vx += dx * pull;
        a.vy += dy * pull;
        b.vx -= dx * pull;
        b.vy -= dy * pull;
        ctx.strokeStyle = "rgba(124, 60, 255, 0.26)";
        ctx.lineWidth = Math.min(2.5, 0.7 + Number(edge.weight || 1) * 0.2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (const node of liveNodes) {
        node.vx += (width / 2 - node.x) * 0.0008;
        node.vy += (height / 2 - node.y) * 0.0008;
        node.vx *= 0.88;
        node.vy *= 0.88;
        node.x = Math.max(26, Math.min(width - 26, node.x + node.vx));
        node.y = Math.max(26, Math.min(height - 26, node.y + node.vy));
        drawGraphNode(ctx, node, selected === node.id);
      }
      frameRef.current = requestAnimationFrame(draw);
    }
    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [edges, selected]);

  function click(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = nodesRef.current.find((node) => Math.hypot(node.x - x, node.y - y) < radiusFor(node) + 8);
    setSelected(hit || null);
  }

  return (
    <div className="graph-wrap">
      {nodes.length === 0 && <EmptyState text="No graph nodes yet. Ingest richer text, then refresh." />}
      <canvas ref={canvasRef} onClick={click} />
      {selected && <div className="node-popover"><strong>{selected.id}</strong><span>{selected.type} · weight {selected.weight}</span></div>}
    </div>
  );
}

function drawGraphNode(ctx, node, selected) {
  const radius = radiusFor(node);
  const color = nodeColor(node.type);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = selected ? 28 : 10;
  ctx.fillStyle = "rgba(5, 9, 24, 0.95)";
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 2.4 : 1.4;
  ctx.beginPath();
  ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#f8fafc";
  ctx.font = `${radius > 18 ? 11 : 9}px Inter`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  wrapCanvasText(ctx, node.id, node.x, node.y, radius * 1.7, radius > 18 ? 13 : 11);
  ctx.restore();
}

function ResultCard({ title, tone, count, items }) {
  return (
    <article className={`result-card ${tone}`}>
      <div><strong>{title}</strong><small>{count}</small></div>
      {items.length === 0 ? <EmptyState text="No live results yet." /> : <ul>{items.slice(0, 6).map((item) => <li key={item}>{item}</li>)}</ul>}
    </article>
  );
}

function LayerDetail({ title, text, items }) {
  return (
    <div className="layer-detail">
      <h3>{title}</h3>
      <p>{text}</p>
      {items.length === 0 ? <EmptyState text="No data for this layer yet." /> : <ul>{items.slice(0, 12).map((item) => <li key={item}>{item}</li>)}</ul>}
    </div>
  );
}

function AnomalyPanel({ anomalies, logs, full = false }) {
  return (
    <section className={full ? "anomaly-panel full" : "anomaly-panel"}>
      <div className="rail-head"><span>Errors & Anomalies</span><strong>{anomalies.length}</strong></div>
      <div className="anomaly-list">
        {anomalies.length === 0 ? <div className="anomaly ok"><CheckCircle2 size={16} /> No active anomalies</div> : anomalies.map((item) => (
          <div className={`anomaly ${item.level}`} key={item.message}><AlertTriangle size={16} /><span>{item.message}</span></div>
        ))}
      </div>
      <div className="log-list">
        {logs.slice(0, full ? 20 : 8).map((log) => <div className={`log ${log.level}`} key={`${log.time}-${log.message}`}><time>{log.time}</time><span>{log.message}</span></div>)}
      </div>
    </section>
  );
}

function MetricBox({ icon: Icon, label, value }) {
  return <div className="metric-box"><Icon size={20} /><span>{label}</span><strong>{value}</strong></div>;
}

function Metric({ label, value, tone, compact }) {
  return <div className={`metric ${compact ? "compact" : ""}`}><span>{label}</span><strong className={tone || ""}>{value}</strong></div>;
}

function StatusPill({ tone, icon: Icon, text, spin }) {
  return <span className={`status-pill ${tone}`}><Icon className={spin ? "spin" : ""} size={14} />{text}</span>;
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function Skeleton() {
  return <div className="skeleton"><span /><span /><span /></div>;
}

function normalizeGraph(data) {
  return { nodes: Array.isArray(data?.nodes) ? data.nodes : [], edges: Array.isArray(data?.edges) ? data.edges : [] };
}

function detectAnomalies({ health, sources, graph, result, error, llmOnline }) {
  const items = [];
  if (error) items.push({ level: "error", message: error });
  if (!health) items.push({ level: "error", message: "Backend health is unavailable." });
  if (health && !llmOnline) items.push({ level: "warn", message: "LLM is offline; system is running retrieval-only answers." });
  if ((health?.l1_stats?.total_chunks ?? 0) === 0) items.push({ level: "warn", message: "No L1 chunks are stored. Ingest source material." });
  if (sources.length === 0) items.push({ level: "warn", message: "No source registry entries found." });
  if (graph.nodes.length === 0) items.push({ level: "warn", message: "L2 graph has no nodes. Ingest richer entity-heavy text." });
  if (graph.nodes.length > 0 && graph.edges.length === 0) items.push({ level: "warn", message: "Graph nodes exist but no relationships were formed." });
  if (result.kick?.fired) items.push({ level: "warn", message: `Kick fired: ${result.kick.message}` });
  return items;
}

function buildRetrievalAnswer(data) {
  const topFact = data.l1_surface?.[0]?.text || "No surface result was returned.";
  const topSchema = data.l3_structural?.[0];
  const schema = topSchema ? `${topSchema.name}: ${topSchema.description}` : "No L3 schema matched.";
  const paths = data.l2_associative?.slice(0, 3).map((item) => item.path || item.entity).join("; ") || "No L2 paths returned.";
  return `Retrieval-only answer\n\n${schema}\n\nTop surface memory: ${topFact}\n\nAssociative context: ${paths}\n\nKick: ${data.kick?.message || "No Kick result."}`;
}

function truncate(text, length) {
  const value = String(text || "");
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

function radiusFor(node) {
  return 8 + Math.min(22, Number(node.weight || 1) * 2.2);
}

function nodeColor(type) {
  const value = String(type || "").toUpperCase();
  if (value === "CONCEPT") return "#05d9e8";
  if (["DATE", "CARDINAL", "QUANTITY", "PERCENT", "MONEY"].includes(value)) return "#f59e0b";
  if (["PERSON", "ORG", "GPE", "LOC", "PRODUCT", "EVENT"].includes(value)) return "#2f7dff";
  return "#7c3cff";
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  lines.push(line);
  const visible = lines.slice(0, 3);
  const startY = y - ((visible.length - 1) * lineHeight) / 2;
  visible.forEach((row, index) => ctx.fillText(row, x, startY + index * lineHeight));
}

createRoot(document.getElementById("root")).render(<App />);
