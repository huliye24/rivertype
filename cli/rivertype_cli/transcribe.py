"""transcribe：工作带 -> 转录初稿。

四种引擎：
    manual     不调 API：生成转录工作队列（人 / AI 编码代理逐带认领填写）。
               这是零成本默认模式——RiverType 自己的工作方式就是让编码代理读图。
    anthropic  Claude（图片 base64）
    openai     GPT-4o / GPT-4.1 视觉系
    ollama     本地多模态模型（llava / qwen2.5vl 等）

转录纪律（写进默认提示词，也可用 prompt_file 覆盖）：
    照录、不径改；可疑之字标【存疑:字】；异文夹注一并照录。
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

from .project import Project

DEFAULT_PROMPT = """你是古籍转录员。逐字转录这张书页图中出现的全部文字。

纪律：
1. 照录原样：保持原文用字与标点，不纠正、不修饰、不“合理化”排印错误。
2. 可疑之字：辨认不确定时，写出你倾向的字并以【存疑:说明】标注，不要留空。
3. 异文夹注（如“某字一作某”）：一并照录，保留括号。
4. 按阅读顺序把竖排/分行文字合并为连续段落；段落起讫以原文缩进为准。
5. 页首或页尾若有残缺，标注【页首残缺】/【页尾残缺】。
6. 只输出转录文本本身，不要任何解释或前言。"""


def band_key_of(path: Path) -> str:
    return path.stem


def pending_bands(project: Project) -> list[Path]:
    manifest = project.manifest
    if not manifest.exists():
        raise SystemExit("没有 manifest/pages.json，请先运行 rivertype render")
    data = json.loads(manifest.read_text(encoding="utf-8"))
    out = []
    for book in data["books"]:
        for page in book["pages"]:
            for band in page["bands"]:
                out.append(project.root / band["image"])
    return out


def run_transcribe(project: Project, engine: str | None = None, force: bool = False,
                   only: str | None = None) -> None:
    cfg = project.transcribe_cfg
    engine = engine or cfg.get("engine", "manual")
    prompt = _load_prompt(project, cfg.get("prompt_file"))
    model = cfg.get("model") or None

    bands = pending_bands(project)
    if only:
        bands = [b for b in bands if only in b.name]

    todo = [b for b in bands if force or not _transcript_path(project, b).exists()]
    print(f"工作带 {len(bands)} 条，待转录 {len(todo)} 条（引擎：{engine}）")

    if engine == "manual":
        _write_queue(project, todo)
        return

    for band in todo:
        print(f"  -> {band.name}")
        text = _call_engine(engine, band, prompt, model)
        _transcript_path(project, band).write_text(text + "\n", encoding="utf-8")
    print(f"transcribe 完成：{len(todo)} 条 -> transcript/")


def _transcript_path(project: Project, band_img: Path) -> Path:
    return project.rel("transcript", band_img.stem + ".md")


def _load_prompt(project: Project, prompt_file: str | None) -> str:
    if prompt_file:
        p = project.rel(prompt_file)
        if p.exists():
            return p.read_text(encoding="utf-8")
    return DEFAULT_PROMPT


def _write_queue(project: Project, todo: list[Path]) -> None:
    lines = [
        "# 转录工作队列",
        "",
        "以下每条带图待转录。把转录文本写入 transcript/<band>.md（同名 .md），",
        "完成后把本条 [ ] 勾为 [x]。纪律见 book.yaml transcribe.prompt 或 README。",
        "",
    ]
    for b in todo:
        lines.append(f"- [ ] `{b.name}`  <-  {b.relative_to(project.root)}")
    queue = project.rel("transcript", "_queue.md")
    queue.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"已生成工作队列：{queue}")


def _b64_image(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


# ---------- 引擎实现（全部延迟导入） ----------

def _call_engine(engine: str, band: Path, prompt: str, model: str | None) -> str:
    try:
        if engine == "anthropic":
            return _via_anthropic(band, prompt, model)
        if engine == "openai":
            return _via_openai(band, prompt, model)
        if engine == "ollama":
            return _via_ollama(band, prompt, model)
    except ImportError as e:
        raise SystemExit(f"引擎 {engine} 依赖未安装：pip install 'rivertype-cli[{engine}]'（{e}）")
    raise SystemExit(f"未知引擎：{engine}（可选 manual / anthropic / openai / ollama）")


def _via_anthropic(band: Path, prompt: str, model: str | None) -> str:
    import anthropic

    client = anthropic.Anthropic()
    model = model or "claude-sonnet-4-5"
    msg = client.messages.create(
        model=model,
        max_tokens=8192,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64", "media_type": "image/png",
                    "data": _b64_image(band)}},
                {"type": "text", "text": prompt},
            ],
        }],
    )
    return "".join(block.text for block in msg.content if block.type == "text")


def _via_openai(band: Path, prompt: str, model: str | None) -> str:
    from openai import OpenAI

    client = OpenAI()
    model = model or "gpt-4o"
    data_uri = "data:image/png;base64," + _b64_image(band)
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": data_uri}},
            {"type": "text", "text": prompt},
        ]}],
    )
    return resp.choices[0].message.content or ""


def _via_ollama(band: Path, prompt: str, model: str | None) -> str:
    import json as _json
    import urllib.request

    model = model or "qwen2.5vl"
    payload = _json.dumps({
        "model": model,
        "stream": False,
        "messages": [{"role": "user", "content": prompt, "images": [_b64_image(band)]}],
    }).encode()
    req = urllib.request.Request(
        "http://localhost:11434/api/chat", data=payload,
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return _json.loads(r.read().decode())["message"]["content"]
