from __future__ import annotations

import os
from itertools import combinations
from typing import Any

import networkx as nx
import spacy


class L2AssociativeEngine:
    """Associative memory using spaCy entities and a directed knowledge graph."""

    def __init__(self) -> None:
        model_name = "en_core_web_sm" if os.getenv("CI", "").lower() == "true" else "en_core_web_lg"
        try:
            self.nlp = spacy.load(model_name)
        except OSError as exc:
            raise RuntimeError(
                f"spaCy model '{model_name}' is not installed. Run: python -m spacy download {model_name}"
            ) from exc
        self.graph: nx.DiGraph = nx.DiGraph()

    def clear(self) -> None:
        self.graph.clear()

    def ingest(self, text: str) -> dict[str, Any]:
        try:
            doc = self.nlp(text[:100000])
            entities = [
                (ent.text.strip(), ent.label_)
                for ent in doc.ents
                if len(ent.text.strip()) >= 3
            ]

            for entity, label in entities:
                if self.graph.has_node(entity):
                    self.graph.nodes[entity]["weight"] = int(self.graph.nodes[entity].get("weight", 1)) + 1
                    if not self.graph.nodes[entity].get("type"):
                        self.graph.nodes[entity]["type"] = label
                else:
                    self.graph.add_node(entity, type=label, weight=1)

            window_size = 5
            for idx in range(len(entities)):
                window = entities[idx : idx + window_size]
                for (source, _), (target, _) in combinations(window, 2):
                    if source == target:
                        continue
                    self._increment_edge(source, target)
                    self._increment_edge(target, source)

            return {
                "entities_found": len(entities),
                "nodes": self.graph.number_of_nodes(),
                "edges": self.graph.number_of_edges(),
            }
        except Exception:
            return {
                "entities_found": 0,
                "nodes": self.graph.number_of_nodes(),
                "edges": self.graph.number_of_edges(),
            }

    def _increment_edge(self, source: str, target: str) -> None:
        if self.graph.has_edge(source, target):
            self.graph[source][target]["weight"] = int(self.graph[source][target].get("weight", 1)) + 1
        else:
            self.graph.add_edge(source, target, weight=1)

    def traverse(self, query: str, depth: int = 2) -> list[dict[str, Any]]:
        try:
            seeds = self._seed_entities(query)
            if not seeds:
                return []

            best: dict[str, dict[str, Any]] = {}
            for seed in seeds:
                paths = nx.single_source_shortest_path(self.graph, seed, cutoff=max(0, depth))
                for entity, path in paths.items():
                    distance = len(path) - 1
                    node_data = self.graph.nodes[entity]
                    existing = best.get(entity)
                    if existing is None or distance < existing["distance"]:
                        best[entity] = {
                            "entity": entity,
                            "distance": distance,
                            "weight": int(node_data.get("weight", 1)),
                            "node_type": str(node_data.get("type", "ENTITY")),
                            "path": " -> ".join(path),
                        }

            ordered = sorted(best.values(), key=lambda item: (item["distance"], -item["weight"], item["entity"].lower()))
            return ordered[:20]
        except Exception:
            return []

    def _seed_entities(self, query: str) -> list[str]:
        doc = self.nlp(query[:100000])
        extracted = [ent.text.strip() for ent in doc.ents if ent.text.strip() in self.graph]
        if extracted:
            return list(dict.fromkeys(extracted))

        query_words = {word.lower() for word in query.split() if len(word) >= 3}
        if not query_words:
            return []
        matches = [
            node
            for node in self.graph.nodes
            if any(word in node.lower() for word in query_words)
        ]
        return sorted(matches, key=lambda node: int(self.graph.nodes[node].get("weight", 1)), reverse=True)[:10]

    def get_subgraph(self, entity: str, depth: int = 2) -> dict[str, list[dict[str, Any]]]:
        try:
            if entity not in self.graph:
                return {"nodes": [], "edges": []}

            nodes = {entity}
            lengths = nx.single_source_shortest_path_length(self.graph, entity, cutoff=max(0, depth))
            nodes.update(lengths.keys())
            subgraph = self.graph.subgraph(nodes)
            return self._format_graph(subgraph)
        except Exception:
            return {"nodes": [], "edges": []}

    def summary_graph(self, limit: int = 30) -> dict[str, list[dict[str, Any]]]:
        top_nodes = sorted(
            self.graph.nodes,
            key=lambda node: int(self.graph.nodes[node].get("weight", 1)),
            reverse=True,
        )[:limit]
        return self._format_graph(self.graph.subgraph(top_nodes))

    def _format_graph(self, graph: nx.DiGraph) -> dict[str, list[dict[str, Any]]]:
        nodes = [
            {
                "id": node,
                "weight": int(data.get("weight", 1)),
                "type": str(data.get("type", "ENTITY")),
            }
            for node, data in graph.nodes(data=True)
        ]
        edges = [
            {
                "source": source,
                "target": target,
                "weight": int(data.get("weight", 1)),
            }
            for source, target, data in graph.edges(data=True)
        ]
        return {"nodes": nodes, "edges": edges}

    def stats(self) -> dict[str, Any]:
        top_entities = [
            {"entity": node, "weight": int(data.get("weight", 1)), "type": str(data.get("type", "ENTITY"))}
            for node, data in sorted(
                self.graph.nodes(data=True),
                key=lambda item: int(item[1].get("weight", 1)),
                reverse=True,
            )[:5]
        ]
        return {
            "nodes": self.graph.number_of_nodes(),
            "edges": self.graph.number_of_edges(),
            "top_entities": top_entities,
        }

    def export_graph(self) -> dict[str, Any]:
        return nx.node_link_data(self.graph, edges="edges")

    def import_graph(self, data: dict[str, Any]) -> dict[str, Any]:
        self.graph = nx.node_link_graph(data, directed=True, edges="edges")
        return self.stats()
