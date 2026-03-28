import base64
import json
import os
import re
from pathlib import Path

import fitz
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from openai import OpenAI
from pydantic import BaseModel, Field
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
FILES_DIR = ROOT / "files"
DATA_DIR = ROOT / "data"
DOCUMENTS_PATH = DATA_DIR / "documents_registry.json"
PROMPTS_DB_PATH = DATA_DIR / "prompt_responses.json"

load_dotenv(ROOT / "backend" / ".env")
load_dotenv(ROOT / ".env")

app = FastAPI(title="AIHUB API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_UPLOADS: dict[str, tuple[str, str]] = {
    ".pdf": ("application/pdf", "pdf"),
    ".jpg": ("image/jpeg", "image"),
    ".jpeg": ("image/jpeg", "image"),
    ".png": ("image/png", "image"),
}


def _ensure_dirs() -> None:
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _ext_from_name(name: str) -> str:
    return Path(name).suffix.lower()


def _safe_stored_name(original: str, default_ext: str) -> str:
    base = Path(original).name
    base = re.sub(r"[^a-zA-Z0-9._-]", "_", base)
    if not Path(base).suffix:
        base = f"{base}{default_ext}"
    return base[:220] or f"file{default_ext}"


def _resolve_kind_mime(doc: dict) -> tuple[str, str]:
    kind = doc.get("kind")
    mime = doc.get("mime_type")
    if kind in ("pdf", "image") and mime:
        return kind, mime
    fn = (doc.get("stored_filename") or "").lower()
    on = (doc.get("original_name") or "").lower()
    for name in (fn, on):
        if name.endswith(".pdf"):
            return "pdf", "application/pdf"
        if name.endswith(".png"):
            return "image", "image/png"
        if name.endswith(".jpg") or name.endswith(".jpeg"):
            return "image", "image/jpeg"
    return "pdf", "application/pdf"


def _load_documents() -> list[dict]:
    _ensure_dirs()
    if not DOCUMENTS_PATH.exists():
        return []
    with open(DOCUMENTS_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("documents", [])


def _save_documents(documents: list[dict]) -> None:
    _ensure_dirs()
    with open(DOCUMENTS_PATH, "w", encoding="utf-8") as f:
        json.dump({"documents": documents}, f, indent=2)


def _next_document_serial(documents: list[dict]) -> int:
    if not documents:
        return 1
    return max(d["serial"] for d in documents) + 1


def _load_prompt_records() -> list[dict]:
    _ensure_dirs()
    if not PROMPTS_DB_PATH.exists():
        return []
    with open(PROMPTS_DB_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("records", [])


def _save_prompt_records(records: list[dict]) -> None:
    _ensure_dirs()
    with open(PROMPTS_DB_PATH, "w", encoding="utf-8") as f:
        json.dump({"records": records}, f, indent=2)


def _next_record_counter(records: list[dict]) -> int:
    if not records:
        return 1
    return max(r["counter"] for r in records) + 1


def _latest_record_for_serial(serial: int) -> dict | None:
    records = _load_prompt_records()
    matching = [r for r in records if r.get("document_serial") == serial]
    if not matching:
        return None
    return max(matching, key=lambda r: int(r.get("counter", 0)))


def _document_path_for_serial(serial: int) -> tuple[dict, Path]:
    documents = _load_documents()
    doc = next((d for d in documents if d["serial"] == serial), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    path = FILES_DIR / doc["stored_filename"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File missing on disk.")
    return doc, path


def _pdf_raw_text(path: Path) -> tuple[str, int]:
    """Extract text only; no placeholder. Returns (text, char_count)."""
    try:
        reader = PdfReader(str(path))
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read PDF: {e!s}",
        ) from e
    parts: list[str] = []
    for page in reader.pages:
        try:
            t = page.extract_text() or ""
        except Exception:
            t = ""
        parts.append(t)
    raw = "\n\n".join(parts).strip()
    return raw, len(raw)


def _truncate_pdf_text(raw: str, max_chars: int) -> tuple[str, bool]:
    if len(raw) <= max_chars:
        return raw, False
    return (
        raw[:max_chars] + "\n\n[... document text truncated for model context ...]",
        True,
    )


def _pdf_pages_as_png_base64(path: Path) -> tuple[list[str], int]:
    """Rasterize PDF pages for vision models (Chat Completions image_url)."""
    max_pages = max(1, int(os.getenv("VISION_PDF_MAX_PAGES", "10")))
    max_side = max(512, int(os.getenv("VISION_MAX_IMAGE_SIDE", "1800")))
    try:
        doc = fitz.open(str(path))
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not rasterize PDF for vision: {e!s}",
        ) from e
    total = doc.page_count
    out: list[str] = []
    try:
        n = min(total, max_pages)
        for i in range(n):
            page = doc.load_page(i)
            rect = page.rect
            w, h = rect.width, rect.height
            if w <= 0 or h <= 0:
                continue
            zoom = min(2.0, max_side / max(w, h))
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            png = pix.tobytes("png")
            out.append(base64.standard_b64encode(png).decode("ascii"))
    finally:
        doc.close()
    if not out:
        raise HTTPException(
            status_code=400,
            detail="PDF has no renderable pages for vision.",
        )
    return out, total


def _vision_completion(
    client: OpenAI,
    model: str,
    system_msg: str,
    intro: str,
    images: list[tuple[str, str]],
) -> str:
    """images: list of (mime_type, base64_without_prefix)"""
    parts: list[dict] = [{"type": "text", "text": intro}]
    for mime, b64 in images:
        parts.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}"},
            }
        )
    completion = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": parts},
        ],
    )
    return (completion.choices[0].message.content or "").strip()


@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    name = file.filename or "upload"
    ext = _ext_from_name(name)
    if ext not in ALLOWED_UPLOADS:
        raise HTTPException(
            status_code=400,
            detail="Allowed types: PDF, JPG, JPEG, PNG.",
        )

    mime_default, kind = ALLOWED_UPLOADS[ext]
    content_type = (file.content_type or "").split(";")[0].strip().lower()

    documents = _load_documents()
    serial = _next_document_serial(documents)
    safe = _safe_stored_name(name, ext)
    stored = f"{serial}_{safe}"
    dest = FILES_DIR / stored

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")

    max_mb = int(os.getenv("UPLOAD_MAX_MB", "25"))
    if len(raw) > max_mb * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"File too large (max {max_mb} MB).",
        )

    _ensure_dirs()
    dest.write_bytes(raw)

    mime = mime_default
    if ext in (".jpg", ".jpeg") and content_type in ("image/jpg", "image/jpeg"):
        mime = "image/jpeg"
    if ext == ".png" and content_type == "image/png":
        mime = "image/png"

    documents.append(
        {
            "serial": serial,
            "original_name": Path(name).name,
            "stored_filename": stored,
            "kind": kind,
            "mime_type": mime,
        }
    )
    _save_documents(documents)

    return {
        "serial": serial,
        "original_name": Path(name).name,
        "file_url": f"/api/files/{serial}",
        "kind": kind,
        "mime_type": mime,
    }


@app.get("/api/documents")
def list_documents():
    documents = _load_documents()
    enriched = []
    for d in documents:
        serial = d["serial"]
        latest = _latest_record_for_serial(serial)
        parts: list[str] = []
        if latest:
            for i in range(1, 6):
                v = str(latest.get(f"name{i}", "") or "").strip()
                if v:
                    parts.append(v)
        preview = " · ".join(parts) if parts else None
        kind, mime = _resolve_kind_mime(d)
        enriched.append(
            {
                **d,
                "kind": kind,
                "mime_type": mime,
                "saved_names_preview": preview,
            }
        )
    return {"documents": enriched}


@app.get("/api/files/{serial}")
def get_file(serial: int):
    documents = _load_documents()
    doc = next((d for d in documents if d["serial"] == serial), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    path = FILES_DIR / doc["stored_filename"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File missing on disk.")
    _, mime = _resolve_kind_mime(doc)
    return FileResponse(
        path,
        media_type=mime,
        filename=doc["original_name"],
    )


class PromptBody(BaseModel):
    prompt: str
    document_serial: int = Field(..., ge=1, description="Uploaded document serial")


@app.post("/api/complete")
def complete_prompt(body: PromptBody):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not configured.",
        )
    model = os.getenv("OPENAI_MODEL", "gpt-4o")
    text = (body.prompt or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    doc_meta, file_path = _document_path_for_serial(body.document_serial)
    doc_name = doc_meta.get("original_name", file_path.name)
    kind, mime = _resolve_kind_mime(doc_meta)
    max_chars = int(os.getenv("DOCUMENT_CONTEXT_MAX_CHARS", "120000"))
    client = OpenAI(api_key=key)

    try:
        if kind == "image":
            b64 = base64.standard_b64encode(file_path.read_bytes()).decode("ascii")
            system_msg = (
                "You are helping the user with questions about an image document. "
                "Use what you see in the image(s). "
                "When the user asks for structured JSON, respond with JSON only as instructed."
            )
            intro = f"Document: {doc_name} (serial #{body.document_serial})\n\nUser instruction:\n{text}"
            content = _vision_completion(
                client,
                model,
                system_msg,
                intro,
                [(mime, b64)],
            )
            return {
                "response": content,
                "model": model,
                "document_serial": body.document_serial,
                "input_mode": "vision",
                "pdf_extracted_chars": None,
                "context_truncated": False,
                "vision_pages_sent": 1,
                "vision_pages_total": 1,
            }

        raw, raw_len = _pdf_raw_text(file_path)
        if raw_len > 0:
            doc_text, truncated = _truncate_pdf_text(raw, max_chars)
            system_msg = (
                "You are helping the user with questions about a PDF document. "
                "The message includes extracted text from that PDF. "
                "Base your answers on that text when possible. "
                "If the excerpt is truncated or not relevant, say so clearly. "
                "When the user asks for structured JSON, respond with JSON only as instructed."
            )
            user_content = (
                f"Document: {doc_name} (serial #{body.document_serial})\n\n"
                f"--- Extracted PDF text ---\n{doc_text}\n\n"
                f"--- User instruction ---\n{text}"
            )
            completion = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_content},
                ],
            )
            content = (completion.choices[0].message.content or "").strip()
            return {
                "response": content,
                "model": model,
                "document_serial": body.document_serial,
                "input_mode": "text",
                "pdf_extracted_chars": raw_len,
                "context_truncated": truncated,
                "vision_pages_sent": None,
                "vision_pages_total": None,
            }

        png_b64_list, page_total = _pdf_pages_as_png_base64(file_path)
        system_msg = (
            "You are helping the user with questions about a PDF document. "
            "The pages are provided as images because no text could be extracted (likely scanned). "
            "Use what you see. When the user asks for structured JSON, respond with JSON only as instructed."
        )
        intro = (
            f"Document: {doc_name} (serial #{body.document_serial}). "
            f"Showing {len(png_b64_list)} of {page_total} page(s) as images.\n\n"
            f"User instruction:\n{text}"
        )
        images = [("image/png", b64) for b64 in png_b64_list]
        content = _vision_completion(client, model, system_msg, intro, images)
        return {
            "response": content,
            "model": model,
            "document_serial": body.document_serial,
            "input_mode": "vision",
            "pdf_extracted_chars": 0,
            "context_truncated": False,
            "vision_pages_sent": len(png_b64_list),
            "vision_pages_total": page_total,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI request failed: {e!s}",
        ) from e


class SaveRecordBody(BaseModel):
    document_serial: int
    document_name: str
    prompt: str
    response: str = ""
    name1: str = ""
    name2: str = ""
    name3: str = ""
    name4: str = ""
    name5: str = ""


@app.post("/api/records")
def save_record(body: SaveRecordBody):
    records = _load_prompt_records()
    payload = {
        "document_serial": body.document_serial,
        "document_name": body.document_name.strip() or "unknown",
        "prompt": body.prompt,
        "response": body.response,
        "name1": body.name1,
        "name2": body.name2,
        "name3": body.name3,
        "name4": body.name4,
        "name5": body.name5,
    }
    latest = _latest_record_for_serial(body.document_serial)
    if latest is not None:
        keep = int(latest.get("counter", 0))
        for i, row in enumerate(records):
            if int(row.get("counter", 0)) == keep and row.get(
                "document_serial"
            ) == body.document_serial:
                records[i] = {"counter": keep, **payload}
                _save_prompt_records(records)
                return {"counter": keep, "ok": True, "updated": True}
    counter = _next_record_counter(records)
    records.append({"counter": counter, **payload})
    _save_prompt_records(records)
    return {"counter": counter, "ok": True, "updated": False}


@app.get("/api/records/latest/{document_serial}")
def get_latest_record_for_document(document_serial: int):
    latest = _latest_record_for_serial(document_serial)
    return {"record": latest}


@app.get("/api/health")
def health():
    return {"status": "ok"}
