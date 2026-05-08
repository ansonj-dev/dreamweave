from __future__ import annotations

from typing import Any

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity


class KickDetector:
    """Detects divergence between retrieved surface facts and structural expectations."""

    def __init__(self, model: SentenceTransformer, threshold: float = 0.42) -> None:
        self.model = model
        self.threshold = threshold

    def check(self, l1_results: list[dict[str, Any]], l3_schemas: list[dict[str, Any]]) -> dict[str, Any]:
        if not l1_results or not l3_schemas:
            return {
                "fired": False,
                "divergence": 0.0,
                "message": "Insufficient data for Kick check",
                "severity": "none",
                "threshold": self.threshold,
            }

        l1_texts = [str(item.get("text", "")).strip() for item in l1_results if str(item.get("text", "")).strip()]
        l3_texts = [
            str(item.get("description", "")).strip()
            for item in l3_schemas
            if str(item.get("description", "")).strip()
        ]
        if not l1_texts or not l3_texts:
            return {
                "fired": False,
                "divergence": 0.0,
                "message": "Insufficient data for Kick check",
                "severity": "none",
                "threshold": self.threshold,
            }

        l1_vectors = np.asarray(self.model.encode(l1_texts, normalize_embeddings=True, show_progress_bar=False), dtype=float)
        l3_vectors = np.asarray(self.model.encode(l3_texts, normalize_embeddings=True, show_progress_bar=False), dtype=float)
        l1_centroid = np.mean(l1_vectors, axis=0).reshape(1, -1)
        l3_centroid = np.mean(l3_vectors, axis=0).reshape(1, -1)
        similarity = float(cosine_similarity(l1_centroid, l3_centroid)[0][0])
        divergence = round(1.0 - similarity, 3)
        fired = divergence > self.threshold

        if not fired:
            severity = "none"
            message = "Layers consistent - surface facts align with structural pattern"
        elif divergence > 0.60:
            severity = "high"
            message = "Strong conflict - surface facts significantly contradict structural pattern"
        else:
            severity = "medium"
            message = "Moderate conflict - surface facts partially diverge from structural expectations"

        return {
            "fired": fired,
            "divergence": divergence,
            "severity": severity,
            "message": message,
            "threshold": self.threshold,
        }
