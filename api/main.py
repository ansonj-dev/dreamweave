from __future__ import annotations

import asyncio
import io
import json
import os
import re
import tempfile
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


class YoutubeIngestRequest(BaseModel):
    video_url: str = Field(..., min_length=8)
    source: str | None = None


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

FRONTEND_HTML = Path(__file__).resolve().parents[1] / "frontend" / "dreamweave.html"


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
            answer = await call_llm(prompt, req.query, req.max_tokens, context)
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
                answer = await call_llm(prompt, req.query, req.max_tokens, context)
            latency_ms = int((time.perf_counter() - started) * 1000)
            yield sse("answer", {"answer": answer, "latency_ms": latency_ms})
            yield sse("done", {"status": "complete"})
        except Exception as exc:
            yield sse("error", {"message": str(exc)})

    return StreamingResponse(events(), media_type="text/event-stream")


async def call_llm(context: str, query: str, max_tokens: int, retrieval_context: dict[str, Any]) -> str:
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
    except Exception as llm_err:
        import logging
        logging.getLogger("dreamweave").warning(f"LLM call failed: {llm_err}")
        return build_retrieval_answer(query, retrieval_context)


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


@app.get("/stats")
async def stats() -> dict:
    dw = get_orchestrator()
    l1 = dw.l1.stats()
    g = dw.l2.stats()
    return {
        "l1_total_chunks": l1.get("total_chunks", 0),
        "l1_avg_depth": l1.get("avg_depth_score", 0.0),
        "l1_sources": l1.get("sources", []),
        "graph_nodes": g.get("nodes", 0),
        "graph_edges": g.get("edges", 0),
        "graph_top_entities": g.get("top_entities", []),
        "kick_threshold": dw.kick.threshold,
        "schemas_count": len(dw.l3.list_schemas()),
    }


@app.get("/sources")
async def sources() -> list[dict[str, Any]]:
    return get_orchestrator().list_sources()


@app.delete("/sources/{source_id:path}")
async def delete_source(source_id: str) -> dict[str, Any]:
    try:
        return get_orchestrator().delete_source(source_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Source deletion failed: {exc}") from exc


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


@app.post("/ingest/youtube", response_model=IngestResponse)
async def ingest_youtube(req: YoutubeIngestRequest) -> IngestResponse:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
        import re as _re
        # Extract video ID from URL
        vid_match = _re.search(r"(?:v=|youtu\.be/)([\w-]{11})", req.video_url)
        if not vid_match:
            raise HTTPException(status_code=400, detail="Could not extract YouTube video ID from URL")
        video_id = vid_match.group(1)
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        text = " ".join(entry["text"] for entry in transcript_list)
        source = req.source or f"youtube:{video_id}"
        result = get_orchestrator().ingest(text=text, source=source)
        return IngestResponse(status="ok", **result)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"YouTube transcript failed: {exc}") from exc


def html_to_text(html: str) -> str:
    without_scripts = re.sub(r"<(script|style).*?>.*?</\1>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    without_tags = re.sub(r"<[^>]+>", " ", without_scripts)
    return re.sub(r"\s+", " ", without_tags).strip()


def extract_uploaded_text(filename: str, content: bytes) -> str:
    lower_name = filename.lower()

    # ── PDF ──────────────────────────────────────────────────────────────
    if lower_name.endswith(".pdf"):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"PDF text extraction failed: {exc}") from exc

    # ── Audio / Video → Whisper transcription ─────────────────────────────
    AV_EXTS = {".mp3", ".mp4", ".wav", ".m4a", ".ogg", ".flac", ".webm", ".mkv", ".avi", ".mov"}
    ext = Path(lower_name).suffix
    if ext in AV_EXTS:
        try:
            import whisper  # type: ignore
        except ImportError:
            raise HTTPException(status_code=400, detail="Whisper is not installed on this server. Run: pip install openai-whisper")
        try:
            model = whisper.load_model("base")
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            result = model.transcribe(tmp_path)
            os.unlink(tmp_path)
            return result.get("text", "").strip()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Audio/video transcription failed: {exc}") from exc

    # ── Images → OCR ─────────────────────────────────────────────────────
    IMG_EXTS = {".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".gif", ".webp"}
    if ext in IMG_EXTS:
        try:
            from PIL import Image  # type: ignore
            import pytesseract  # type: ignore
            img = Image.open(io.BytesIO(content))
            return pytesseract.image_to_string(img).strip()
        except ImportError:
            raise HTTPException(status_code=400, detail="Image OCR requires: pip install pillow pytesseract (and tesseract-ocr system package)")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Image OCR failed: {exc}") from exc

    # ── DOCX ─────────────────────────────────────────────────────────────
    if lower_name.endswith(".docx"):
        try:
            import zipfile, xml.etree.ElementTree as ET
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                xml_content = z.read("word/document.xml")
            tree = ET.fromstring(xml_content)
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            return " ".join(node.text or "" for node in tree.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")).strip()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"DOCX extraction failed: {exc}") from exc

    # ── Plain text fallback ───────────────────────────────────────────────
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise HTTPException(status_code=400, detail=f"Unsupported file type or encoding: {ext}")


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True)}\n\n"


def build_retrieval_answer(query: str, context: dict[str, Any]) -> str:
    l1 = context.get("l1_surface", [])
    l2 = context.get("l2_associative", [])
    l3 = context.get("l3_structural", [])
    kick = context.get("kick", {})

    top_fact = l1[0].get("text", "") if l1 else "No surface memory matched this query yet."
    top_schema = l3[0] if l3 else {}
    schema_name = top_schema.get("name", "no structural schema")
    schema_description = top_schema.get("description", "No L3 structural pattern cleared the confidence threshold.")
    paths = "; ".join(item.get("path", item.get("entity", "")) for item in l2[:3]) or "No L2 graph paths were found."

    return (
        "Local LLM is not reachable yet, so DREAMWEAVE is showing a retrieval-grounded answer.\n\n"
        f"Query: {query}\n\n"
        f"L3 identified the strongest structure as {schema_name}: {schema_description}\n\n"
        f"Top L1 surface fact: {top_fact[:700]}\n\n"
        f"L2 associative paths: {paths}\n\n"
        f"Kick status: {kick.get('message', 'Kick was not evaluated')} "
        f"(severity: {kick.get('severity', 'none')}, divergence: {kick.get('divergence', 0.0)})."
    )


@app.get("/", response_model=None)
async def serve_frontend_root():
    if FRONTEND_HTML.exists():
        return FileResponse(FRONTEND_HTML, media_type="text/html")
    return {
        "status": "DREAMWEAVE API running",
        "docs": "/docs",
    }
