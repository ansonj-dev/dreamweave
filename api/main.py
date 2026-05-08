from __future__ import annotations

import asyncio
import io
import json
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.responses import FileResponse
from starlette.responses import StreamingResponse

from core.orchestrator import DreamWeaveOrchestrator


load_dotenv()

LLM_URL = os.getenv("LLM_URL", "http://localhost:8001/v1/chat/completions")
LLM_MODEL = os.getenv("LLM_MODEL", "meta-llama/Meta-Llama-3-8B-Instruct")

orchestrator: DreamWeaveOrchestrator | None = None


class IngestRequest(BaseModel):
    text: str = Field(..., min_length=1)
    source: str = "manual"


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    generate_answer: bool = True
    max_tokens: int = Field(default=600, ge=1, le=4096)
    kick_enabled: bool = True


class UrlIngestRequest(BaseModel):
    url: str = Field(..., min_length=8)
    source: str = "url"


class BatchIngestRequest(BaseModel):
    documents: list[IngestRequest] = Field(..., min_length=1)


class MemoryPathRequest(BaseModel):
    path: str | None = None


class IngestResponse(BaseModel):
    status: str
    chunks_ingested: int
    source: str
    graph_nodes: int
    graph_edges: int


class RetrieveResponse(BaseModel):
    query: str
    l1_surface: list[dict[str, Any]]
    l2_associative: list[dict[str, Any]]
    l3_structural: list[dict[str, Any]]
    kick: dict[str, Any]
    kick_reranked_surface: list[dict[str, Any]] = []
    graph_stats: dict[str, Any]
    answer: str
    latency_ms: int


@asynccontextmanager
async def lifespan(app: FastAPI):
    global orchestrator
    orchestrator = DreamWeaveOrchestrator()
    yield


app = FastAPI(title="DREAMWEAVE API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="frontend-assets")


def get_orchestrator() -> DreamWeaveOrchestrator:
    if orchestrator is None:
        raise HTTPException(status_code=503, detail="DREAMWEAVE orchestrator is still starting")
    return orchestrator


@app.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest) -> IngestResponse:
    try:
        result = get_orchestrator().ingest(text=req.text, source=req.source)
        return IngestResponse(status="ok", **result)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ingest failed: {exc}") from exc


@app.post("/ingest/batch")
async def ingest_batch(req: BatchIngestRequest) -> dict[str, Any]:
    try:
        documents = [
            document.model_dump() if hasattr(document, "model_dump") else document.dict()
            for document in req.documents
        ]
        return {"status": "ok", **get_orchestrator().ingest_batch(documents)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Batch ingest failed: {exc}") from exc


@app.post("/ingest/file", response_model=IngestResponse)
async def ingest_file(file: UploadFile = File(...), source: str | None = None) -> IngestResponse:
    try:
        raw = await file.read()
        source_name = source or file.filename or "uploaded_file"
        text = extract_uploaded_text(filename=source_name, content=raw)
        if not text.strip():
            raise HTTPException(status_code=400, detail="Uploaded file did not contain extractable text")
        result = get_orchestrator().ingest(text=text, source=source_name)
        return IngestResponse(status="ok", **result)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"File ingest failed: {exc}") from exc


@app.post("/retrieve", response_model=RetrieveResponse)
async def retrieve(req: QueryRequest) -> RetrieveResponse:
    started = time.perf_counter()
    answer = "Answer generation disabled"
    try:
        dw = get_orchestrator()
        context = dw.retrieve(req.query, kick_enabled=req.kick_enabled)
        if req.generate_answer:
            prompt = dw.build_llm_context(context)
            answer = await call_llm(prompt, req.query, req.max_tokens)
        latency_ms = int((time.perf_counter() - started) * 1000)
        return RetrieveResponse(answer=answer, latency_ms=latency_ms, **context)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retrieve failed: {exc}") from exc


@app.post("/retrieve/stream")
async def retrieve_stream(req: QueryRequest) -> StreamingResponse:
    async def events():
        started = time.perf_counter()
        yield sse("status", {"message": "Starting layered retrieval"})
        await asyncio.sleep(0)
        try:
            dw = get_orchestrator()
            context = dw.retrieve(req.query, kick_enabled=req.kick_enabled)
            yield sse("layers", context)
            answer = "Answer generation disabled"
            if req.generate_answer:
                yield sse("status", {"message": "Calling local LLM"})
                prompt = dw.build_llm_context(context)
                answer = await call_llm(prompt, req.query, req.max_tokens)
            latency_ms = int((time.perf_counter() - started) * 1000)
            yield sse("answer", {"answer": answer, "latency_ms": latency_ms})
            yield sse("done", {"status": "complete"})
        except Exception as exc:
            yield sse("error", {"message": str(exc)})

    return StreamingResponse(events(), media_type="text/event-stream")


async def call_llm(context: str, query: str, max_tokens: int) -> str:
    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": context},
            {"role": "user", "content": query},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(LLM_URL, json=payload)
            response.raise_for_status()
            data = response.json()
            return str(data["choices"][0]["message"]["content"])
    except Exception:
        return "LLM unavailable - showing retrieval context only"


@app.get("/health")
async def health() -> dict[str, Any]:
    dw = get_orchestrator()
    return {
        "status": "alive",
        "runtime": dw.runtime_status(),
        "layers": ["L1", "L2", "L3", "Kick"],
        "l1_stats": dw.l1.stats(),
        "graph_stats": dw.l2.stats(),
        "llm_url": LLM_URL,
        "llm_model": LLM_MODEL,
    }


@app.get("/health/llm")
async def health_llm() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                LLM_URL,
                json={
                    "model": LLM_MODEL,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                    "temperature": 0,
                },
            )
        return {"status": "reachable" if response.status_code < 500 else "error", "status_code": response.status_code}
    except Exception as exc:
        return {"status": "unreachable", "error": str(exc)}


@app.get("/graph")
async def graph(entity: str | None = Query(default=None)) -> dict[str, Any]:
    try:
        return get_orchestrator().get_graph_data(entity)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Graph fetch failed: {exc}") from exc


@app.get("/schemas")
async def schemas() -> list[dict[str, str]]:
    return get_orchestrator().l3.list_schemas()


@app.get("/sources")
async def sources() -> list[dict[str, Any]]:
    return get_orchestrator().list_sources()


@app.post("/memory/save")
async def save_memory(req: MemoryPathRequest | None = None) -> dict[str, Any]:
    try:
        return get_orchestrator().save_memory(req.path if req else None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Memory save failed: {exc}") from exc


@app.post("/memory/load")
async def load_memory(req: MemoryPathRequest | None = None) -> dict[str, Any]:
    try:
        return get_orchestrator().load_memory(req.path if req else None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Memory load failed: {exc}") from exc


@app.delete("/memory")
async def clear_memory() -> dict[str, Any]:
    try:
        return get_orchestrator().clear_memory()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Memory clear failed: {exc}") from exc


@app.post("/ingest/url", response_model=IngestResponse)
async def ingest_url(req: UrlIngestRequest) -> IngestResponse:
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(req.url)
            response.raise_for_status()
        text = html_to_text(response.text)
        source = req.source if req.source != "url" else req.url
        result = get_orchestrator().ingest(text=text, source=source)
        return IngestResponse(status="ok", **result)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=400, detail=f"URL fetch failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"URL ingest failed: {exc}") from exc


def html_to_text(html: str) -> str:
    without_scripts = re.sub(r"<(script|style).*?>.*?</\1>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    without_tags = re.sub(r"<[^>]+>", " ", without_scripts)
    return re.sub(r"\s+", " ", without_tags).strip()


def extract_uploaded_text(filename: str, content: bytes) -> str:
    lower_name = filename.lower()
    if lower_name.endswith(".pdf"):
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(content))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"PDF text extraction failed: {exc}") from exc
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(status_code=400, detail="Unsupported text encoding")


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True)}\n\n"


@app.get("/", response_model=None)
async def serve_frontend_root():
    index = FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    return {
        "status": "DREAMWEAVE API running",
        "frontend": "Build frontend with: cd frontend && npm install && VITE_DREAMWEAVE_API=http://165.245.142.189:8000 npm run build",
    }


@app.get("/app/{path:path}", response_model=None)
async def serve_frontend_app(path: str):
    index = FRONTEND_DIST / "index.html"
    if not index.exists():
        raise HTTPException(status_code=404, detail="Frontend build not found. Run npm run build in frontend.")
    return FileResponse(index)
