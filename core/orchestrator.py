from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

from core.kick import KickDetector
from layers.l1_surface import L1SurfaceEngine
from layers.l2_associative import L2AssociativeEngine
from layers.l3_structural import L3StructuralEngine


load_dotenv()


class DreamWeaveOrchestrator:
    """Coordinates DREAMWEAVE's layered memory engines."""

    def __init__(self) -> None:
        self.embedding_model_name = os.getenv("EMBEDDING_MODEL", "all-mpnet-base-v2")
        self.memory_dir = Path(os.getenv("DREAMWEAVE_MEMORY_DIR", "memory_store"))
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.sources: dict[str, dict[str, Any]] = {}
        self.started_at = time.time()
        self.model = SentenceTransformer(self.embedding_model_name)
        self.l1 = L1SurfaceEngine(model=self.model)
        self.l2 = L2AssociativeEngine()
        self.l3 = L3StructuralEngine(model=self.model)
        self.kick = KickDetector(
            model=self.model,
            threshold=float(os.getenv("KICK_THRESHOLD", "0.42")),
        )
        if os.getenv("DREAMWEAVE_AUTO_LOAD", "true").lower() == "true":
            self.load_memory()

    def ingest(self, text: str, source: str = "manual") -> dict[str, Any]:
        l1_stats = self.l1.ingest(text=text, source=source)
        l2_stats = self.l2.ingest(text=text)
        chunks = int(l1_stats.get("chunks_ingested", 0))
        self._record_source(source=source, chunks=chunks, characters=len(text), kind="text")
        self._auto_save()
        return {
            "chunks_ingested": chunks,
            "source": l1_stats.get("source", source),
            "graph_nodes": int(l2_stats.get("nodes", 0)),
            "graph_edges": int(l2_stats.get("edges", 0)),
        }

    def ingest_batch(self, documents: list[dict[str, str]]) -> dict[str, Any]:
        results = []
        for document in documents:
            text = str(document.get("text", ""))
            source = str(document.get("source", "batch"))
            if text.strip():
                results.append(self.ingest(text=text, source=source))
        return {
            "documents_ingested": len(results),
            "chunks_ingested": sum(int(item.get("chunks_ingested", 0)) for item in results),
            "results": results,
            "graph_nodes": self.l2.graph.number_of_nodes(),
            "graph_edges": self.l2.graph.number_of_edges(),
        }

    def retrieve(self, query: str, kick_enabled: bool = True) -> dict[str, Any]:
        l1_results = self.l1.search(query, top_k=5)
        l2_results = self.l2.traverse(query, depth=2)
        l3_results = self.l3.match_pattern(query, top_k=3)
        kick_result = self.kick.check(l1_results, l3_results) if kick_enabled else {
            "fired": False,
            "divergence": 0.0,
            "severity": "none",
            "message": "Kick check disabled",
            "threshold": self.kick.threshold,
        }
        reranked_surface = self._kick_rerank(query, l1_results, l2_results, l3_results) if kick_result.get("fired") else []
        return {
            "query": query,
            "l1_surface": l1_results,
            "l2_associative": l2_results[:15],
            "l3_structural": l3_results,
            "kick": kick_result,
            "kick_reranked_surface": reranked_surface,
            "graph_stats": self.l2.stats(),
        }

    def _kick_rerank(
        self,
        query: str,
        l1_results: list[dict[str, Any]],
        l2_results: list[dict[str, Any]],
        l3_results: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        entity_terms = [item.get("entity", "") for item in l2_results[:6]]
        schema_terms = []
        for schema in l3_results[:2]:
            schema_terms.extend(str(schema.get("keywords", "")).split(",")[:4])
        expanded_query = " ".join([query, *entity_terms, *schema_terms])
        expanded_results = self.l1.search(expanded_query, top_k=8)

        seen: set[str] = set()
        merged: list[dict[str, Any]] = []
        for item in expanded_results + l1_results:
            key = f"{item.get('source')}::{item.get('text')}"
            if key in seen:
                continue
            seen.add(key)
            copy = dict(item)
            copy["rerank_reason"] = "Kick expansion used L2 entities and L3 schema keywords"
            merged.append(copy)
        return merged[:5]

    def build_llm_context(self, context: dict[str, Any]) -> str:
        l1_lines = []
        for idx, item in enumerate(context.get("l1_surface", [])[:3], start=1):
            l1_lines.append(
                f"{idx}. score={item.get('score', 0)} source={item.get('source', 'unknown')} :: {item.get('text', '')}"
            )
        if not l1_lines:
            l1_lines.append("No surface facts retrieved.")

        l2_lines = []
        for idx, item in enumerate(context.get("l2_associative", [])[:5], start=1):
            l2_lines.append(f"{idx}. {item.get('entity', '')} -> {item.get('path', '')}")
        if not l2_lines:
            l2_lines.append("No related graph concepts found.")

        l3_lines = []
        for idx, item in enumerate(context.get("l3_structural", []), start=1):
            l3_lines.append(
                f"{idx}. {item.get('name', '')} confidence={item.get('confidence', 0)} :: {item.get('description', '')}"
            )
        if not l3_lines:
            l3_lines.append("No structural schema matched above threshold.")

        kick = context.get("kick", {})
        reranked = context.get("kick_reranked_surface", [])
        reranked_lines = []
        for idx, item in enumerate(reranked[:3], start=1):
            reranked_lines.append(
                f"{idx}. score={item.get('score', 0)} source={item.get('source', 'unknown')} :: {item.get('text', '')}"
            )
        return "\n".join(
            [
                "=== DREAMWEAVE LAYERED CONTEXT ===",
                "",
                "SURFACE FACTS (L1 - Vector Retrieval):",
                *l1_lines,
                "",
                "RELATED CONCEPTS (L2 - Knowledge Graph):",
                *l2_lines,
                "",
                "STRUCTURAL PATTERN (L3 - Pattern Geometry):",
                *l3_lines,
                "",
                "KICK STATUS:",
                f"{kick.get('message', 'No Kick status')} Severity: {kick.get('severity', 'none')}",
                "",
                "KICK RERANKED SURFACE FACTS:",
                *(reranked_lines or ["No Kick re-ranking was applied."]),
                "",
                "Use this layered context to provide a comprehensive, well-reasoned answer.",
            ]
        )

    def get_graph_data(self, entity: str | None = None) -> dict[str, Any]:
        if entity:
            return self.l2.get_subgraph(entity, depth=2)
        return self.l2.summary_graph(limit=30)

    def list_sources(self) -> list[dict[str, Any]]:
        l1_sources = {item["source"]: item for item in self.l1.stats().get("sources", [])}
        combined = []
        for source, meta in self.sources.items():
            entry = dict(meta)
            entry["chunks"] = int(l1_sources.get(source, {}).get("chunks", entry.get("chunks", 0)))
            combined.append(entry)
        for source, item in l1_sources.items():
            if source not in self.sources:
                combined.append(
                    {
                        "source": source,
                        "chunks": item.get("chunks", 0),
                        "characters": 0,
                        "kind": "unknown",
                        "created_at": None,
                        "updated_at": None,
                    }
                )
        return sorted(combined, key=lambda item: str(item.get("updated_at") or ""), reverse=True)

    def clear_memory(self) -> dict[str, Any]:
        self.l1.clear()
        self.l2.clear()
        self.sources.clear()
        self._auto_save()
        return {"status": "cleared", "l1_stats": self.l1.stats(), "graph_stats": self.l2.stats()}

    def save_memory(self, path: str | None = None) -> dict[str, Any]:
        target = Path(path) if path else self.memory_dir / "dreamweave_memory.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "version": 1,
            "saved_at": time.time(),
            "embedding_model": self.embedding_model_name,
            "kick_threshold": self.kick.threshold,
            "sources": self.sources,
            "l1_points": self.l1.export_points(),
            "l2_graph": self.l2.export_graph(),
        }
        target.write_text(json.dumps(data), encoding="utf-8")
        return {
            "status": "saved",
            "path": str(target),
            "chunks": len(data["l1_points"]),
            "nodes": self.l2.graph.number_of_nodes(),
            "edges": self.l2.graph.number_of_edges(),
        }

    def load_memory(self, path: str | None = None) -> dict[str, Any]:
        target = Path(path) if path else self.memory_dir / "dreamweave_memory.json"
        if not target.exists():
            return {"status": "missing", "path": str(target), "loaded": False}
        data = json.loads(target.read_text(encoding="utf-8"))
        chunks = self.l1.import_points(data.get("l1_points", []))
        graph_stats = self.l2.import_graph(data.get("l2_graph", {"nodes": [], "edges": []}))
        self.sources = {
            str(source): dict(meta)
            for source, meta in dict(data.get("sources", {})).items()
        }
        return {
            "status": "loaded",
            "path": str(target),
            "loaded": True,
            "chunks": chunks,
            "graph_stats": graph_stats,
        }

    def runtime_status(self) -> dict[str, Any]:
        return {
            "status": "ready",
            "uptime_seconds": round(time.time() - self.started_at, 2),
            "embedding_model": self.embedding_model_name,
            "spacy_model": self.l2.nlp.meta.get("name", "unknown"),
            "memory_dir": str(self.memory_dir),
            "kick_threshold": self.kick.threshold,
            "l1_stats": self.l1.stats(),
            "graph_stats": self.l2.stats(),
            "sources": self.list_sources(),
        }

    def _record_source(self, source: str, chunks: int, characters: int, kind: str) -> None:
        now = time.time()
        existing = self.sources.get(source, {})
        self.sources[source] = {
            "source": source,
            "kind": kind,
            "chunks": int(existing.get("chunks", 0)) + chunks,
            "characters": int(existing.get("characters", 0)) + characters,
            "created_at": existing.get("created_at", now),
            "updated_at": now,
        }

    def _auto_save(self) -> None:
        if os.getenv("DREAMWEAVE_AUTO_SAVE", "true").lower() == "true":
            self.save_memory()
