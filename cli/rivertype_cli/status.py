"""Read-only machine interface for publishing agents."""

from __future__ import annotations

import json
from pathlib import Path

from . import __version__
from .project import Project


def capabilities() -> dict:
    return {
        "schema_version": "rpp/0.1",
        "cli_version": __version__,
        "content_protocol": "rtp/0.1",
        "commands": [
            "init", "render", "preprocess", "transcribe", "verify",
            "collate", "assemble", "build", "validate", "status", "capabilities",
        ],
        "machine_interface": ["capabilities --json", "status <project> --json"],
        "formats": {"source": ["pdf"], "transcript": ["md", "rt"], "output": ["epub", "pdf"]},
    }


def _count(path: Path, pattern: str) -> int:
    return sum(1 for _ in path.glob(pattern)) if path.exists() else 0


def project_status(project: Project) -> dict:
    root = project.root
    manifest = project.manifest
    pages = bands = 0
    if manifest.exists():
        data = json.loads(manifest.read_text(encoding="utf-8"))
        for book in data.get("books", []):
            for page in book.get("pages", []):
                pages += 1
                bands += len(page.get("bands", []))
    transcripts = _count(root / "transcript", "*.md")
    if (root / "transcript" / "_queue.md").exists():
        transcripts -= 1
    pending = max(bands - transcripts, 0)
    chapters = _count(root / "manuscript" / "chapters", "*.md")
    outputs = sorted(str(p.relative_to(root)).replace("\\", "/") for p in (root / "output").glob("*.*")
                     if p.suffix.lower() in {".epub", ".pdf"})
    if not manifest.exists():
        next_action = "render"
    elif pending:
        next_action = "transcribe"
    elif not (root / "verify" / "verify.md").exists():
        next_action = "verify"
    elif chapters == 0:
        next_action = "assemble"
    elif not outputs:
        next_action = "build"
    else:
        next_action = "review"
    return {
        "schema_version": "rpp/0.1",
        "project": str(root),
        "title": project.title,
        "source_pdf": project.config.get("source_pdf", ""),
        "artifacts": {
            "source_pdfs": _count(root / "scans", "*.pdf"),
            "pages": pages,
            "bands": bands,
            "preprocessed_pages": _count(root / "preprocessed", "*.png"),
            "transcripts": transcripts,
            "pending_transcripts": pending,
            "rt_files": _count(root / "transcript", "*.rt"),
            "chapters": chapters,
            "outputs": outputs,
        },
        "next_action": next_action,
    }
