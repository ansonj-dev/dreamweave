# DREAMWEAVE Backend Production Notes

## Added production-grade backend capabilities

- Persistent memory snapshots through `POST /memory/save` and `POST /memory/load`.
- Automatic snapshot load/save using `DREAMWEAVE_AUTO_LOAD` and `DREAMWEAVE_AUTO_SAVE`.
- Source registry through `GET /sources`.
- Batch ingestion through `POST /ingest/batch`.
- File ingestion through `POST /ingest/file` for text-like files and PDFs.
- Memory reset through `DELETE /memory`.
- LLM reachability probe through `GET /health/llm`.
- Streaming retrieval events through `POST /retrieve/stream`.
- Kick re-ranking when divergence fires, exposed as `kick_reranked_surface`.

## Recommended GPU deployment flow

1. Install Python requirements.
2. Download `en_core_web_lg`.
3. Start vLLM on port `8001`.
4. Start the API on port `8000`.
5. Start the frontend on port `5173`.

## Important environment variables

- `LLM_URL`
- `LLM_MODEL`
- `KICK_THRESHOLD`
- `EMBEDDING_MODEL`
- `DREAMWEAVE_MEMORY_DIR`
- `DREAMWEAVE_AUTO_LOAD`
- `DREAMWEAVE_AUTO_SAVE`
