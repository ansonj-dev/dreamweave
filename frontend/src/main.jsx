import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Database,
  FileText,
  Gauge,
  GitBranch,
  Layers,
  MessageSquare,
  Network,
  Paperclip,
  Play,
  Radar,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  Upload,
  Zap
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_DREAMWEAVE_API || "http://localhost:8000";

const demoSources = [
  { name: "network_theory.txt", type: "TXT", size: "4.8 KB", layer: "L1" },
  { name: "climate_systems.txt", type: "TXT", size: "5.2 KB", layer: "L1" },
  { name: "ml_optimization.txt", type: "TXT", size: "4.5 KB", layer: "L1" },
  { name: "urban_planning.txt", type: "TXT", size: "4.9 KB", layer: "L2" },
  { name: "epidemiology.txt", type: "TXT", size: "5.0 KB", layer: "L3" }
];

const demoSchemas = [
  { name: "network_propagation", confidence: 0.86, color: "#3B82F6", description: "Threshold-based spread through connected nodes in a network" },
  { name: "feedback_loop", confidence: 0.62, color: "#F59E0B", description: "Self-reinforcing or self-correcting cyclic system dynamics" },
  { name: "temporal_evolution", confidence: 0.49, color: "#EC4899", description: "State change over time with dependence on historical states" }
];

const demoResult = {
  query: "How do misinformation campaigns spread online?",
  answer:
    "Misinformation campaigns spread through a layered combination of network propagation, emotional triggering, and ranking amplification. L1 finds the surface evidence: repeated exposure, echo chambers, hubs, and algorithmic boosts. L2 connects those facts into a graph of platforms, psychological triggers, engagement loops, and diffusion paths. L3 recognizes the governing structure as network propagation: nodes activate when exposure crosses a threshold, then cascades move through bridges and high-degree hubs.\n\nThe Kick mechanism flags a medium divergence because some retrieved surface chunks emphasize psychological manipulation while the strongest structural pattern expects graph diffusion. In practice, DREAMWEAVE should answer with both: the campaign spreads across the graph, but the reason the graph activates is emotional salience and identity reinforcement.",
  l1_surface: [
    { text: "Social media algorithms amplify emotionally engaging narratives across connected communities.", score: 0.84, source: "social_dynamics.txt", depth_score: 0.3, access_count: 7 },
    { text: "False information spreads faster when repeated by trusted hubs inside echo chambers.", score: 0.81, source: "network_effects.pdf", depth_score: 0.2, access_count: 5 },
    { text: "Recommendation systems create long-range shortcuts where a message leaps between communities.", score: 0.77, source: "information_diffusion.md", depth_score: 0.1, access_count: 3 }
  ],
  l2_associative: [
    { entity: "Social Media Platforms", path: "misinformation -> social network -> echo chamber", weight: 9, node_type: "CONCEPT", distance: 1 },
    { entity: "Algorithmic Amplification", path: "algorithm -> engagement -> recommendation", weight: 8, node_type: "CONCEPT", distance: 1 },
    { entity: "Psychological Triggers", path: "identity -> anger -> sharing", weight: 7, node_type: "CONCEPT", distance: 2 },
    { entity: "Information Diffusion", path: "hub -> bridge -> cascade", weight: 6, node_type: "CONCEPT", distance: 2 }
  ],
  l3_structural: demoSchemas,
  kick: {
    fired: true,
    divergence: 0.47,
    severity: "medium",
    message: "Moderate conflict - surface facts partially diverge from structural expectations",
    threshold: 0.42
  },
  graph_stats: { nodes: 23, edges: 31, top_entities: [] },
  latency_ms: 12450
};

const demoGraph = {
  nodes: [
    { id: "Misinformation Campaigns", weight: 18, type: "L4", cluster: "center" },
    { id: "Social Media Platforms", weight: 11, type: "L1", cluster: "surface" },
    { id: "Twitter", weight: 4, type: "L1", cluster: "surface" },
    { id: "Facebook", weight: 4, type: "L1", cluster: "surface" },
    { id: "TikTok", weight: 4, type: "L1", cluster: "surface" },
    { id: "Reddit", weight: 4, type: "L1", cluster: "surface" },
    { id: "Psychological Triggers", weight: 10, type: "L2", cluster: "assoc" },
    { id: "Fear", weight: 4, type: "L2", cluster: "assoc" },
    { id: "Anger", weight: 4, type: "L2", cluster: "assoc" },
    { id: "Bias", weight: 4, type: "L2", cluster: "assoc" },
    { id: "Identity", weight: 4, type: "L2", cluster: "assoc" },
    { id: "Algorithmic Amplification", weight: 10, type: "L3", cluster: "struct" },
    { id: "Engagement", weight: 4, type: "L3", cluster: "struct" },
    { id: "Ranking", weight: 4, type: "L3", cluster: "struct" },
    { id: "Recommendation", weight: 4, type: "L3", cluster: "struct" },
    { id: "Virality", weight: 4, type: "L3", cluster: "struct" },
    { id: "Information Diffusion", weight: 10, type: "L4", cluster: "diffusion" },
    { id: "Spread", weight: 4, type: "L4", cluster: "diffusion" },
    { id: "Cascade Effect", weight: 4, type: "L4", cluster: "diffusion" },
    { id: "Echo Chamber", weight: 4, type: "L4", cluster: "diffusion" },
    { id: "Network Effect", weight: 4, type: "L4", cluster: "diffusion" }
  ],
  edges: [
    ["Misinformation Campaigns", "Social Media Platforms"],
    ["Social Media Platforms", "Twitter"],
    ["Social Media Platforms", "Facebook"],
    ["Social Media Platforms", "TikTok"],
    ["Social Media Platforms", "Reddit"],
    ["Misinformation Campaigns", "Psychological Triggers"],
    ["Psychological Triggers", "Fear"],
    ["Psychological Triggers", "Anger"],
    ["Psychological Triggers", "Bias"],
    ["Psychological Triggers", "Identity"],
    ["Misinformation Campaigns", "Algorithmic Amplification"],
    ["Algorithmic Amplification", "Engagement"],
    ["Algorithmic Amplification", "Ranking"],
    ["Algorithmic Amplification", "Recommendation"],
    ["Algorithmic Amplification", "Virality"],
    ["Misinformation Campaigns", "Information Diffusion"],
    ["Information Diffusion", "Spread"],
    ["Information Diffusion", "Cascade Effect"],
    ["Information Diffusion", "Echo Chamber"],
    ["Information Diffusion", "Network Effect"],
    ["Social Media Platforms", "Algorithmic Amplification"],
    ["Psychological Triggers", "Information Diffusion"],
    ["Algorithmic Amplification", "Information Diffusion"]
  ].map(([source, target]) => ({ source, target, weight: 1 }))
};

function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

function formatLatency(ms) {
  if (!ms) return "demo";
  return `${(ms / 1000).toFixed(2)}s`;
}

function truncate(text, length = 96) {
  const value = String(text || "");
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }
  return response.json();
}

function App() {
  const [activeView, setActiveView] = useState("chat");
  const [apiOnline, setApiOnline] = useState(false);
  const [health, setHealth] = useState(null);
  const [sources, setSources] = useState(demoSources);
  const [result, setResult] = useState(demoResult);
  const [schemas, setSchemas] = useState(demoSchemas);
  const [graph, setGraph] = useState(demoGraph);
  const [query, setQuery] = useState(demoResult.query);
  const [isLoading, setIsLoading] = useState(false);
  const [kickEnabled, setKickEnabled] = useState(true);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [logs, setLogs] = useState([
    { time: "12:45:22", text: "Kick triggered: Conflict between surface data and structural pattern detected", fire: true },
    { time: "12:45:23", text: "Analyzing contradictions across layers...", fire: false },
    { time: "12:45:24", text: "Re-ranking retrieval with graph context...", fire: false },
    { time: "12:45:25", text: "New context assembled. Generating response...", fire: false }
  ]);

  const refreshHealth = useCallback(async () => {
    try {
      const data = await request("/health");
      setApiOnline(true);
      setHealth(data);
      const graphData = await request("/graph");
      setGraph(graphData.nodes?.length ? graphData : demoGraph);
      const schemaData = await request("/schemas");
      setSchemas(schemaData?.length ? schemaData : demoSchemas);
    } catch {
      setApiOnline(false);
      setHealth(null);
      setGraph(demoGraph);
      setSchemas(demoSchemas);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  const addLog = useCallback((text, fire = false) => {
    const now = new Date().toLocaleTimeString([], { hour12: false });
    setLogs((current) => [{ time: now, text, fire }, ...current].slice(0, 10));
  }, []);

  const runQuery = async (event) => {
    event?.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    setIsLoading(true);
    addLog("Layered retrieval started across L1, L2, and L3", false);
    try {
      if (!apiOnline) throw new Error("offline");
      const data = await request("/retrieve", {
        method: "POST",
        body: JSON.stringify({
          query: cleanQuery,
          generate_answer: true,
          max_tokens: 700,
          kick_enabled: kickEnabled
        })
      });
      setResult(data);
      addLog(data.kick?.message || "Retrieval completed", Boolean(data.kick?.fired));
      const graphData = await request("/graph");
      setGraph(graphData.nodes?.length ? graphData : graph);
    } catch {
      setResult({ ...demoResult, query: cleanQuery });
      setGraph(demoGraph);
      addLog("Offline demo retrieval rendered because backend is unavailable", true);
    } finally {
      setIsLoading(false);
    }
  };

  const ingest = async ({ source, text }) => {
    if (!text.trim()) {
      return "Paste text before ingesting.";
    }
    try {
      const data = await request("/ingest", {
        method: "POST",
        body: JSON.stringify({ source, text })
      });
      setSources((current) => [{ name: source, type: sourceType(source), size: "Live source", layer: "L1" }, ...current]);
      await refreshHealth();
      addLog(`Ingested ${data.chunks_ingested} chunks from ${source}`, false);
      return `Ingested ${data.chunks_ingested} chunks. Graph now has ${data.graph_nodes} nodes and ${data.graph_edges} edges.`;
    } catch {
      return "Backend unavailable. Start the API on the GPU instance, then ingest again.";
    }
  };

  const memoryChunks = health?.l1_stats?.total_chunks ?? result.l1_surface.length;
  const graphNodes = health?.graph_stats?.nodes ?? result.graph_stats.nodes;
  const graphEdges = health?.graph_stats?.edges ?? result.graph_stats.edges;

  return (
    <div className="shell">
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        sources={sources}
        apiOnline={apiOnline}
        memoryChunks={memoryChunks}
        onUpload={() => setIngestOpen(true)}
      />
      <main className="workspace">
        <TopBar kickEnabled={kickEnabled} setKickEnabled={setKickEnabled} apiOnline={apiOnline} />
        <LayerStrip result={result} schemas={schemas} />
        {activeView === "chat" && (
          <ChatView
            result={result}
            query={query}
            setQuery={setQuery}
            runQuery={runQuery}
            isLoading={isLoading}
            kickEnabled={kickEnabled}
            graphNodes={graphNodes}
            graphEdges={graphEdges}
          />
        )}
        {activeView === "ingest" && <IngestView onIngest={ingest} sources={sources} />}
        {activeView === "layers" && <LayersView result={result} schemas={schemas} />}
        {activeView === "graph" && <GraphExplorer graph={graph} result={result} />}
        {activeView === "analytics" && <AnalyticsView result={result} memoryChunks={memoryChunks} graphNodes={graphNodes} graphEdges={graphEdges} logs={logs} />}
        {activeView === "settings" && <SettingsView apiBase={API_BASE} kickEnabled={kickEnabled} setKickEnabled={setKickEnabled} apiOnline={apiOnline} />}
      </main>
      <RightRail graph={graph} logs={logs} result={result} />
      <IngestModal open={ingestOpen} onClose={() => setIngestOpen(false)} onIngest={ingest} />
    </div>
  );
}

function Sidebar({ activeView, setActiveView, sources, apiOnline, memoryChunks, onUpload }) {
  const nav = [
    ["chat", MessageSquare, "Chat"],
    ["ingest", Upload, "Ingest"],
    ["layers", Layers, "Memory Layers"],
    ["graph", GitBranch, "Graph Explorer"],
    ["analytics", BarChart3, "Analytics"],
    ["settings", Settings, "Settings"]
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><span /></div>
        <div>
          <h1>DREAMWEAVE</h1>
          <p>Layered Memory Intelligence Framework</p>
        </div>
      </div>
      <nav className="nav">
        {nav.map(([id, Icon, label]) => (
          <button key={id} className={classNames(activeView === id && "active")} onClick={() => setActiveView(id)} type="button">
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-section">
        <div className="section-title">
          <span>Ingested Sources</span>
          <button type="button" onClick={onUpload}>+ Upload</button>
        </div>
        <div className="source-list">
          {sources.slice(0, 7).map((source) => (
            <div className="source-row" key={`${source.name}-${source.size}`}>
              <span className={classNames("filetype", source.type.toLowerCase())}>{source.type}</span>
              <span>
                <strong>{source.name}</strong>
                <small>{source.type} · {source.size}</small>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="status-card">
        <div className="status-head">
          <Shield size={18} />
          <span>
            System Status
            <small className={apiOnline ? "ok" : "bad"}>{apiOnline ? "All systems operational" : "Offline demo mode"}</small>
          </span>
        </div>
        <Metric label="Layers Active" value="3 / 3" />
        <Metric label="Kick Sensitivity" value="0.42" warm />
        <Metric label="Memory Chunks" value={String(memoryChunks)} />
        <div className="util"><span style={{ width: `${Math.min(100, Math.max(18, Number(memoryChunks) * 7 || 68))}%` }} /></div>
      </div>
    </aside>
  );
}

function TopBar({ kickEnabled, setKickEnabled, apiOnline }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Active Workspace</p>
        <h2>Layered Cognitive Memory Console</h2>
      </div>
      <div className="top-actions">
        <span className={classNames("connection", apiOnline ? "online" : "offline")}>
          <CircleDot size={14} />
          {apiOnline ? "API connected" : "Demo mode"}
        </span>
        <label className="switch-label">
          Kick Mode
          <button className={classNames("switch", !kickEnabled && "off")} type="button" onClick={() => setKickEnabled(!kickEnabled)} aria-label="Toggle Kick mode" />
        </label>
        <div className="avatar" />
      </div>
    </header>
  );
}

function LayerStrip({ result, schemas }) {
  const layers = [
    { id: "L1", name: "Surface", sub: "Vector Search", color: "blue", value: `${result.l1_surface.length} hits` },
    { id: "L2", name: "Associative", sub: "Graph Relations", color: "cyan", value: `${result.l2_associative.length} paths` },
    { id: "L3", name: "Structural", sub: "Pattern Geometry", color: "gold", value: schemas[0]?.name || "schemas" },
    { id: "L4", name: "Archetype", sub: "Roadmap Layer", color: "violet", value: "future" }
  ];
  return (
    <section className="layer-strip">
      {layers.map((layer) => (
        <article className={classNames("layer-card", layer.color)} key={layer.id}>
          <span>{layer.id}</span>
          <div>
            <strong>{layer.name}</strong>
            <small>{layer.sub}</small>
          </div>
          <em>{layer.value}</em>
        </article>
      ))}
    </section>
  );
}

function ChatView({ result, query, setQuery, runQuery, isLoading, graphNodes, graphEdges }) {
  const kickFired = Boolean(result.kick?.fired);
  return (
    <section className="chat-grid">
      <div className="question-card">
        <span>?</span>
        <h2>{result.query}</h2>
      </div>
      <article className="answer-panel">
        <div className="panel-title">
          <span><Sparkles size={16} /> DREAMWEAVE Answer</span>
          <div className="panel-actions">
            {kickFired && <strong className="kick-pill"><AlertTriangle size={14} /> Kick Triggered</strong>}
            <small>{formatLatency(result.latency_ms)}</small>
          </div>
        </div>
        <p>{result.answer}</p>
        <div className="summary-divider" />
        <div className="summary-title">Retrieval Summary</div>
        <div className="retrieval-cards">
          <RetrievalCard type="l1" title="L1 Surface Results" count={`${result.l1_surface.length} chunks retrieved`} icon={<Database size={20} />} items={result.l1_surface.slice(0, 3).map((item) => truncate(item.text, 78))} footer="View Chunks" />
          <RetrievalCard type="l2" title="L2 Associative Results" count={`${result.l2_associative.length} relationships found`} icon={<Network size={20} />} items={result.l2_associative.slice(0, 4).map((item) => item.path || item.entity)} footer="View Graph" />
          <KickCard kick={result.kick} schemas={result.l3_structural} />
        </div>
        <SourceChips result={result} />
      </article>
      <StatsRibbon graphNodes={graphNodes} graphEdges={graphEdges} result={result} />
      <form className="query-box" onSubmit={runQuery}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask anything about your knowledge..." />
        <div className="query-tools"><Paperclip size={18} /><Radar size={18} /></div>
        <button type="submit" disabled={isLoading}><Send size={18} />{isLoading ? "Thinking" : "Send"}</button>
      </form>
    </section>
  );
}

function RetrievalCard({ type, title, count, icon, items, footer }) {
  return (
    <article className={classNames("retrieval-card", type)}>
      <div className="card-heading">
        <span>{icon}</span>
        <div><strong>{title}</strong><small>{count}</small></div>
      </div>
      <ul>
        {items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>No results yet</li>}
      </ul>
      <button type="button">{footer} <ChevronRight size={14} /></button>
    </article>
  );
}

function KickCard({ kick, schemas }) {
  const schema = schemas?.[0];
  return (
    <article className="retrieval-card kick">
      <div className="card-heading">
        <span><AlertTriangle size={20} /></span>
        <div><strong>Kick Mechanism</strong><small>{kick?.fired ? "Conflict detected" : "No conflict detected"}</small></div>
      </div>
      <p>{kick?.message || "Kick has not evaluated yet."}</p>
      {schema && <div className="schema-meter"><span>{schema.name}</span><i><b style={{ width: `${Math.round((schema.confidence || 0) * 100)}%` }} /></i></div>}
      <em>{kick?.fired ? "Re-ranking retrieval..." : `Divergence ${kick?.divergence ?? 0}`}</em>
    </article>
  );
}

function SourceChips({ result }) {
  const sources = [...new Set(result.l1_surface.map((item) => item.source).filter(Boolean))];
  const chips = [
    ...sources.slice(0, 3).map((source, idx) => ({ name: source, meta: `L1 · Chunk #${idx + 1}` })),
    ...(result.l3_structural[0] ? [{ name: `${result.l3_structural[0].name}.pattern`, meta: "L3 · Pattern" }] : [])
  ];
  return (
    <section className="source-chips">
      <div><strong>Sources Used</strong><button type="button">View All ({chips.length})</button></div>
      <div className="chips">
        {chips.map((chip) => <span key={`${chip.name}-${chip.meta}`}><strong>{chip.name}</strong><small>{chip.meta}</small></span>)}
      </div>
    </section>
  );
}

function StatsRibbon({ graphNodes, graphEdges, result }) {
  return (
    <div className="stats-ribbon">
      <MetricBox icon={<BrainCircuit />} label="Graph Nodes" value={graphNodes} />
      <MetricBox icon={<GitBranch />} label="Graph Edges" value={graphEdges} />
      <MetricBox icon={<Gauge />} label="Kick Divergence" value={result.kick?.divergence ?? 0} />
      <MetricBox icon={<Zap />} label="Top Schema" value={result.l3_structural[0]?.name || "none"} />
    </div>
  );
}

function IngestView({ onIngest, sources }) {
  const [source, setSource] = useState("manual_notes.txt");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Ready to ingest into L1 Surface and L2 Associative memory.");
  const submit = async () => setStatus(await onIngest({ source, text }));
  return (
    <section className="page-panel ingest-page">
      <div className="page-head">
        <div><p className="eyebrow">Memory Intake</p><h2>Ingest Documents</h2></div>
        <CheckCircle2 size={24} />
      </div>
      <div className="ingest-layout">
        <div className="ingest-form">
          <label>Source Name<input value={source} onChange={(event) => setSource(event.target.value)} /></label>
          <label>Document Text<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste research text, notes, markdown, paper excerpts, or structured documentation..." /></label>
          <button className="primary" type="button" onClick={submit}><Upload size={18} /> Ingest into DREAMWEAVE</button>
          <p>{status}</p>
        </div>
        <div className="recent-sources">
          <h3>Current Source Queue</h3>
          {sources.map((item) => <div key={`${item.name}-${item.size}`}><FileText size={16} /><span>{item.name}</span><small>{item.layer}</small></div>)}
        </div>
      </div>
    </section>
  );
}

function LayersView({ result, schemas }) {
  return (
    <section className="page-panel">
      <div className="page-head"><div><p className="eyebrow">Layer Inspector</p><h2>Memory Layers</h2></div><Layers size={24} /></div>
      <div className="layer-inspector">
        <LayerDetail title="L1 Surface" accent="blue" body="Raw chunk retrieval, Qdrant cosine search, depth scoring, access counts, and source-level traceability." items={result.l1_surface.map((item) => `${item.source}: ${truncate(item.text, 90)}`)} />
        <LayerDetail title="L2 Associative" accent="cyan" body="spaCy entity extraction, co-occurrence edges, directed NetworkX traversal, and graph neighborhoods." items={result.l2_associative.map((item) => item.path || item.entity)} />
        <LayerDetail title="L3 Structural" accent="gold" body="Eight hardcoded cognitive schemas matched by embedding geometry against the user query." items={schemas.map((schema) => `${schema.name}: ${schema.description}`)} />
        <LayerDetail title="Kick Mechanism" accent="pink" body="Divergence detector between L1 surface facts and L3 structural expectations." items={[result.kick.message, `threshold=${result.kick.threshold}`, `divergence=${result.kick.divergence}`]} />
      </div>
    </section>
  );
}

function LayerDetail({ title, accent, body, items }) {
  return (
    <article className={classNames("layer-detail", accent)}>
      <h3>{title}</h3>
      <p>{body}</p>
      <ul>{items.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul>
    </article>
  );
}

function GraphExplorer({ graph, result }) {
  return (
    <section className="page-panel graph-page">
      <div className="page-head"><div><p className="eyebrow">Associative Topology</p><h2>Graph Explorer</h2></div><Network size={24} /></div>
      <div className="graph-large"><MemoryGraph graph={graph} /></div>
      <div className="path-list">
        {result.l2_associative.map((item) => <div key={item.path || item.entity}><strong>{item.entity}</strong><span>{item.path}</span></div>)}
      </div>
    </section>
  );
}

function AnalyticsView({ result, memoryChunks, graphNodes, graphEdges, logs }) {
  return (
    <section className="page-panel">
      <div className="page-head"><div><p className="eyebrow">Telemetry</p><h2>Analytics</h2></div><Activity size={24} /></div>
      <div className="analytics-grid">
        <MetricBox icon={<Database />} label="Chunks" value={memoryChunks} />
        <MetricBox icon={<Network />} label="Nodes" value={graphNodes} />
        <MetricBox icon={<GitBranch />} label="Edges" value={graphEdges} />
        <MetricBox icon={<AlertTriangle />} label="Kick Severity" value={result.kick.severity} />
      </div>
      <div className="timeline">
        {logs.map((log) => <div className={classNames(log.fire && "fire")} key={`${log.time}-${log.text}`}><span>{log.time}</span>{log.text}</div>)}
      </div>
    </section>
  );
}

function SettingsView({ apiBase, kickEnabled, setKickEnabled, apiOnline }) {
  return (
    <section className="page-panel">
      <div className="page-head"><div><p className="eyebrow">Runtime</p><h2>Settings</h2></div><Settings size={24} /></div>
      <div className="settings-grid">
        <Setting label="API Base URL" value={apiBase} />
        <Setting label="Backend Status" value={apiOnline ? "Connected" : "Offline demo"} />
        <Setting label="LLM Endpoint" value="http://localhost:8001/v1/chat/completions" />
        <Setting label="Embedding Model" value="sentence-transformers/all-mpnet-base-v2" />
        <Setting label="spaCy Model" value="en_core_web_lg" />
        <label className="setting-row interactive">Kick Mode<button className={classNames("switch", !kickEnabled && "off")} type="button" onClick={() => setKickEnabled(!kickEnabled)} /></label>
      </div>
    </section>
  );
}

function RightRail({ graph, logs, result }) {
  return (
    <aside className="right-rail">
      <section className="visual-panel">
        <div className="rail-head"><span>Memory Visualization</span><strong>● Live</strong></div>
        <div className="tabs"><button className="active">Graph View</button><button>Layer View</button><button>Path View</button></div>
        <MemoryGraph graph={graph} />
        <div className="legend">
          <span><i className="l1" />L1 Surface</span>
          <span><i className="l2" />L2 Associative</span>
          <span><i className="l3" />L3 Structural</span>
          <span><i className="l4" />L4 Roadmap</span>
          <span><b />Conflict Path</span>
        </div>
      </section>
      <section className="kick-log">
        <div className="rail-head"><span>Kick Activity Log</span><button type="button">View All Logs -></button></div>
        {logs.map((log) => (
          <div className={classNames("log-row", log.fire && "fire")} key={`${log.time}-${log.text}`}>
            <i />
            <span>{log.time}</span>
            <p>{log.text}</p>
          </div>
        ))}
        <div className="kick-readout">
          <strong>{result.kick.severity}</strong>
          <span>Current divergence: {result.kick.divergence}</span>
        </div>
      </section>
    </aside>
  );
}

function MemoryGraph({ graph }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef([]);
  const frameRef = useRef(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(360, Math.floor(rect.width * dpr));
    canvas.height = Math.max(320, Math.floor(rect.height * dpr));
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const previous = new Map(nodesRef.current.map((node) => [node.id, node]));
    const anchors = {
      center: [0.5, 0.52],
      surface: [0.28, 0.28],
      assoc: [0.72, 0.34],
      struct: [0.30, 0.72],
      diffusion: [0.72, 0.72]
    };
    nodesRef.current = (graph.nodes || []).map((node, index) => {
      const old = previous.get(node.id);
      const anchor = anchors[node.cluster] || [0.5 + Math.cos(index) * 0.2, 0.5 + Math.sin(index) * 0.2];
      return {
        ...node,
        x: old?.x ?? anchor[0] * width + Math.cos(index * 1.9) * 42,
        y: old?.y ?? anchor[1] * height + Math.sin(index * 1.9) * 42,
        vx: old?.vx ?? 0,
        vy: old?.vy ?? 0
      };
    });
  }, [graph]);

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
      const nodes = nodesRef.current;
      const byId = new Map(nodes.map((node) => [node.id, node]));

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distanceSquared = Math.max(90, dx * dx + dy * dy);
          const force = 160 / distanceSquared;
          a.vx += dx * force;
          a.vy += dy * force;
          b.vx -= dx * force;
          b.vy -= dy * force;
        }
      }

      for (const edge of graph.edges || []) {
        const a = byId.get(edge.source);
        const b = byId.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const force = (distance - 116) * 0.0008;
        a.vx += dx * force;
        a.vy += dy * force;
        b.vx -= dx * force;
        b.vy -= dy * force;
        const conflict = edge.source === "Social Media Platforms" && edge.target === "Algorithmic Amplification";
        ctx.save();
        ctx.strokeStyle = conflict ? "rgba(255,71,126,0.78)" : "rgba(124,60,255,0.24)";
        ctx.lineWidth = conflict ? 1.6 : 1;
        ctx.setLineDash(conflict ? [5, 5] : []);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }

      for (const node of nodes) {
        const pull = node.cluster === "center" ? 0.002 : 0.0004;
        node.vx += (width / 2 - node.x) * pull;
        node.vy += (height / 2 - node.y) * pull;
        node.vx *= 0.88;
        node.vy *= 0.88;
        node.x = Math.max(34, Math.min(width - 34, node.x + node.vx + Math.sin(Date.now() / 900 + node.weight) * 0.04));
        node.y = Math.max(34, Math.min(height - 34, node.y + node.vy + Math.cos(Date.now() / 1100 + node.weight) * 0.04));
        drawNode(ctx, node, selected === node.id);
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [graph, selected]);

  const onClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = nodesRef.current.find((node) => Math.hypot(node.x - x, node.y - y) < 14 + Number(node.weight || 1) * 2.1);
    setSelected(hit?.id || null);
  };

  return (
    <div className="graph-canvas-wrap">
      <canvas ref={canvasRef} onClick={onClick} />
      {selected && <div className="node-popover">{selected}</div>}
    </div>
  );
}

function drawNode(ctx, node, selected) {
  const color = nodeColor(node.type);
  const radius = 10 + Math.min(42, Number(node.weight || 1) * 2.15);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = selected ? 34 : 18;
  ctx.fillStyle = "rgba(4,8,20,0.94)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(node.x, node.y, radius + 9 + Math.sin(Date.now() / 540) * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#f8fafc";
  ctx.font = `${node.weight > 9 ? 12 : 10}px Inter`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  wrapCanvasText(ctx, node.id, node.x, node.y, Math.max(58, radius * 1.5), node.weight > 9 ? 15 : 12);
  ctx.restore();
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

function nodeColor(type) {
  const value = String(type || "").toUpperCase();
  if (value.includes("L1") || value.includes("ORG") || value.includes("PRODUCT")) return "#2f7dff";
  if (value.includes("L2") || value.includes("PERSON") || value.includes("GPE") || value.includes("CONCEPT")) return "#05d9e8";
  if (value.includes("L3")) return "#f59e0b";
  return "#7c3aed";
}

function IngestModal({ open, onClose, onIngest }) {
  const [source, setSource] = useState("manual_notes.txt");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Ready");
  if (!open) return null;
  const submit = async () => setStatus(await onIngest({ source, text }));
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head"><h2>Ingest Source</h2><button type="button" onClick={onClose}>Close</button></div>
        <label>Source Name<input value={source} onChange={(event) => setSource(event.target.value)} /></label>
        <label>Source Text<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste a document, notes, transcript, or markdown here..." /></label>
        <div className="modal-foot"><span>{status}</span><button className="primary" type="button" onClick={submit}><Upload size={18} /> Ingest</button></div>
      </div>
    </div>
  );
}

function Metric({ label, value, warm }) {
  return <div className="metric"><span>{label}</span><strong className={warm ? "warm" : ""}>{value}</strong></div>;
}

function MetricBox({ icon, label, value }) {
  return <div className="metric-box">{React.cloneElement(icon, { size: 20 })}<span>{label}</span><strong>{value}</strong></div>;
}

function Setting({ label, value }) {
  return <div className="setting-row"><span>{label}</span><strong>{value}</strong></div>;
}

function sourceType(source) {
  const lower = source.toLowerCase();
  if (lower.endsWith(".md")) return "MD";
  if (lower.endsWith(".pdf")) return "PDF";
  return "TXT";
}

createRoot(document.getElementById("root")).render(<App />);
