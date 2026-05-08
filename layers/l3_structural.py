from __future__ import annotations

from typing import Any

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity


SCHEMAS: list[dict[str, str]] = [
    {
        "name": "network_propagation",
        "description": "Threshold-based spread through connected nodes in a network",
        "keywords": "spread, contagion, diffusion, cascade, viral, wildfire, epidemic, infection",
        "exemplar": "How does a virus spread through a population network?",
        "color": "#3B82F6",
    },
    {
        "name": "optimization_search",
        "description": "Finding optimal solutions within a constrained search space",
        "keywords": "optimize, minimize, maximize, efficient, allocate, schedule, best route",
        "exemplar": "What is the most efficient allocation of limited resources?",
        "color": "#10B981",
    },
    {
        "name": "feedback_loop",
        "description": "Self-reinforcing or self-correcting cyclic system dynamics",
        "keywords": "feedback, loop, cycle, reinforce, amplify, dampen, self-regulate",
        "exemplar": "How does inflation affect interest rates which in turn affect inflation?",
        "color": "#F59E0B",
    },
    {
        "name": "classification_boundary",
        "description": "Separating a space into distinct categories with decision boundaries",
        "keywords": "classify, distinguish, detect, identify, label, separate, categorize",
        "exemplar": "How do you distinguish between two similar but distinct categories?",
        "color": "#EF4444",
    },
    {
        "name": "hierarchical_structure",
        "description": "Nested levels of organization with parent-child relationships",
        "keywords": "hierarchy, tree, nested, parent, child, level, depth, layer, taxonomy",
        "exemplar": "How is a complex system organized from top-level to granular components?",
        "color": "#8B5CF6",
    },
    {
        "name": "equilibrium_dynamics",
        "description": "System seeking stable balance point between opposing forces",
        "keywords": "equilibrium, balance, stable, tension, steady state, tipping point",
        "exemplar": "How do opposing forces reach a natural balance point in a system?",
        "color": "#06B6D4",
    },
    {
        "name": "temporal_evolution",
        "description": "State change over time with dependence on historical states",
        "keywords": "time, evolution, history, growth, decay, sequence, forecast, trend",
        "exemplar": "How does a system's current state depend on its past trajectory?",
        "color": "#EC4899",
    },
    {
        "name": "anomaly_detection",
        "description": "Identifying deviations from expected baseline patterns",
        "keywords": "anomaly, outlier, unusual, fraud, abnormal, deviation, exception",
        "exemplar": "How do you identify data points that deviate from normal behavior?",
        "color": "#84CC16",
    },
]


class L3StructuralEngine:
    """Structural pattern matcher over a fixed schema geometry."""

    def __init__(self, model: SentenceTransformer | None = None) -> None:
        self.model = model or SentenceTransformer("all-mpnet-base-v2")
        exemplars = [schema["exemplar"] for schema in SCHEMAS]
        self.schema_vectors = np.asarray(
            self.model.encode(exemplars, normalize_embeddings=True, show_progress_bar=False),
            dtype=float,
        )

    def match_pattern(self, query: str, top_k: int = 3) -> list[dict[str, Any]]:
        if not query.strip():
            return []
        query_vector = np.asarray(
            self.model.encode(query, normalize_embeddings=True, show_progress_bar=False),
            dtype=float,
        ).reshape(1, -1)
        scores = cosine_similarity(query_vector, self.schema_vectors)[0]
        matches: list[dict[str, Any]] = []
        for idx, score in enumerate(scores):
            if float(score) > 0.30:
                schema = SCHEMAS[idx]
                matches.append(
                    {
                        "name": schema["name"],
                        "description": schema["description"],
                        "confidence": round(float(score), 3),
                        "color": schema["color"],
                        "keywords": schema["keywords"],
                    }
                )
        matches.sort(key=lambda item: item["confidence"], reverse=True)
        return matches[:top_k]

    def list_schemas(self) -> list[dict[str, str]]:
        return [dict(schema) for schema in SCHEMAS]
