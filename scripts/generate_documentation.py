#!/usr/bin/env python3
"""
Generuje dokumentację projektu Studenckie PKI:
  - docs/generated/studenckie-pki-dokumentacja.html  (otwórz w przeglądarce → Drukuj → Zapisz jako PDF)
  - docs/generated/studenckie-pki-dokumentacja.pdf   (jeśli zainstalowano fpdf2)

Użycie:
  pip install -r scripts/requirements-docs.txt
  python scripts/generate_documentation.py
"""

from __future__ import annotations

import html
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "docs" / "generated"
FONTS_DIR = ROOT / "docs" / "fonts"

SKIP_DIRS = {
    ".git",
    ".next",
    "node_modules",
    "__pycache__",
    "generated",
    "fonts",
    ".cursor",
}

SKIP_FILES = {
    "package-lock.json",
    "VERIFY_BACKEND_SNIPPET.py",
    "GenerateCertificate.tsx",
}

INCLUDE_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".sql",
    ".yml",
    ".yaml",
    ".css",
    ".js",
    ".json",
    ".md",
    ".MD",
    "Dockerfile",
}

FONT_FILES = {
    "DejaVuSans.ttf": "https://cdn.jsdelivr.net/npm/@vintproykt/dejavu-fonts-ttf@2.37.0/ttf/DejaVuSans.ttf",
    "DejaVuSans-Bold.ttf": "https://cdn.jsdelivr.net/npm/@vintproykt/dejavu-fonts-ttf@2.37.0/ttf/DejaVuSans-Bold.ttf",
    "DejaVuSansMono.ttf": "https://cdn.jsdelivr.net/npm/@vintproykt/dejavu-fonts-ttf@2.37.0/ttf/DejaVuSansMono.ttf",
}


def collect_source_files() -> list[Path]:
    files: list[Path] = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if path.name in SKIP_FILES:
            continue
        if path.suffix not in INCLUDE_EXTENSIONS and path.name not in {"Dockerfile"}:
            continue
        if path.stat().st_size > 500_000:
            continue
        files.append(path)
    return files


def build_tree(files: list[Path]) -> str:
    lines: list[str] = []
    for path in files:
        lines.append(str(path.relative_to(ROOT)).replace("\\", "/"))
    return "\n".join(lines)


def read_text(path: Path) -> str:
    for encoding in ("utf-8", "utf-8-sig", "cp1250", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="replace")


def _chunk_text(text: str, max_len: int) -> list[str]:
    if not text:
        return []
    return [text[i : i + max_len] for i in range(0, len(text), max_len)]


def _sanitize_pdf_text(text: str) -> str:
    return "".join(ch if ch == "\n" or ch == "\t" or ord(ch) >= 32 else "?" for ch in text)


def generate_pdf_from_html(html_path: Path) -> Path | None:
    """PDF z HTML przez headless Chrome/Edge (najlepsza jakosc, pelna tresc)."""
    pdf_path = OUTPUT_DIR / "studenckie-pki-dokumentacja.pdf"
    file_url = html_path.resolve().as_uri()

    browser_cmds: list[list[str]] = []
    for name in ("msedge", "chrome", "chromium", "google-chrome"):
        exe = shutil.which(name)
        if exe:
            browser_cmds.append(
                [
                    exe,
                    "--headless=new",
                    "--disable-gpu",
                    "--no-pdf-header-footer",
                    f"--print-to-pdf={pdf_path.resolve()}",
                    file_url,
                ]
            )

    for cmd in browser_cmds:
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=180,
                check=False,
            )
            if pdf_path.exists() and pdf_path.stat().st_size > 1000:
                return pdf_path
            if result.stderr:
                print(f"  ({cmd[0]}): {result.stderr.strip()[:200]}")
        except (OSError, subprocess.TimeoutExpired) as exc:
            print(f"  ({cmd[0]}): {exc}")

    return None


def load_presentation_md() -> str:
    presentation = ROOT / "docs" / "PREZENTACJA.md"
    if presentation.exists():
        return read_text(presentation)
    return "# Prezentacja\n\nBrak pliku docs/PREZENTACJA.md"


def markdown_to_html_simple(md: str) -> str:
    lines = md.splitlines()
    out: list[str] = []
    in_code = False
    in_ul = False

    for line in lines:
        if line.strip().startswith("```"):
            if in_code:
                out.append("</code></pre>")
                in_code = False
            else:
                out.append('<pre class="code"><code>')
                in_code = True
            continue

        if in_code:
            out.append(html.escape(line))
            continue

        if line.startswith("### "):
            if in_ul:
                out.append("</ul>")
                in_ul = False
            out.append(f"<h3>{html.escape(line[4:])}</h3>")
        elif line.startswith("## "):
            if in_ul:
                out.append("</ul>")
                in_ul = False
            out.append(f"<h2>{html.escape(line[3:])}</h2>")
        elif line.startswith("# "):
            if in_ul:
                out.append("</ul>")
                in_ul = False
            out.append(f"<h1>{html.escape(line[2:])}</h1>")
        elif line.startswith("- "):
            if not in_ul:
                out.append("<ul>")
                in_ul = True
            out.append(f"<li>{html.escape(line[2:])}</li>")
        elif line.strip() == "":
            if in_ul:
                out.append("</ul>")
                in_ul = False
            out.append("<p></p>")
        else:
            if in_ul:
                out.append("</ul>")
                in_ul = False
            out.append(f"<p>{html.escape(line)}</p>")

    if in_ul:
        out.append("</ul>")
    if in_code:
        out.append("</code></pre>")
    return "\n".join(out)


def generate_html(files: list[Path], tree: str) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    presentation_html = markdown_to_html_simple(load_presentation_md())
    readme_path = ROOT / "README.MD"
    readme_html = ""
    if readme_path.exists():
        readme_html = markdown_to_html_simple(read_text(readme_path))

    file_sections: list[str] = []
    for path in files:
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        content = html.escape(read_text(path))
        ext = path.suffix.lstrip(".") or "text"
        file_sections.append(
            f"""
<section class="file-block page-break">
  <h2>{rel}</h2>
  <pre class="code"><code class="language-{ext}">{content}</code></pre>
</section>
"""
        )

    doc = f"""<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>Studenckie PKI — dokumentacja projektu</title>
  <style>
    :root {{
      --text: #111827;
      --muted: #4b5563;
      --border: #d1d5db;
      --bg: #ffffff;
      --code-bg: #f3f4f6;
      --accent: #1d4ed8;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: "Segoe UI", Arial, sans-serif;
      color: var(--text);
      line-height: 1.55;
      margin: 0;
      background: var(--bg);
    }}
    .cover {{
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 64px;
      border-bottom: 4px solid var(--accent);
    }}
    .cover h1 {{ font-size: 42px; margin: 0 0 12px; }}
    .cover p {{ color: var(--muted); font-size: 18px; }}
    .container {{ max-width: 1100px; margin: 0 auto; padding: 40px 32px 80px; }}
    h1, h2, h3 {{ page-break-after: avoid; }}
    h2 {{ margin-top: 40px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }}
    .tree {{
      white-space: pre-wrap;
      font-family: Consolas, "Courier New", monospace;
      font-size: 12px;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }}
    .code {{
      white-space: pre-wrap;
      word-break: break-word;
      font-family: Consolas, "Courier New", monospace;
      font-size: 11px;
      line-height: 1.45;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      overflow-wrap: anywhere;
    }}
    .toc li {{ margin: 6px 0; }}
    .page-break {{ page-break-before: always; }}
    @media print {{
      body {{ font-size: 11pt; }}
      .container {{ max-width: none; padding: 0 12mm; }}
      .cover {{ min-height: auto; padding: 24mm 12mm; }}
      .no-print {{ display: none; }}
      a {{ color: inherit; text-decoration: none; }}
    }}
  </style>
</head>
<body>
  <section class="cover">
    <h1>Studenckie PKI</h1>
    <p>Dokumentacja projektu — struktura, kod źródłowy, prezentacja</p>
    <p>Wygenerowano: {html.escape(datetime.now().strftime("%Y-%m-%d %H:%M"))}</p>
    <p class="no-print" style="margin-top:24px;color:var(--accent)">
      Aby uzyskać PDF: <strong>Ctrl+P</strong> → „Zapisz jako PDF”
    </p>
  </section>

  <div class="container">
    <section>
      <h1>Spis treści</h1>
      <ol class="toc">
        <li>Prezentacja projektu</li>
        <li>README</li>
        <li>Struktura plików ({len(files)} plików źródłowych)</li>
        <li>Kod źródłowy — wszystkie pliki</li>
      </ol>
    </section>

    <section class="page-break">
      <h1>1. Prezentacja projektu</h1>
      {presentation_html}
    </section>

    <section class="page-break">
      <h1>2. README</h1>
      {readme_html}
    </section>

    <section class="page-break">
      <h1>3. Struktura plików</h1>
      <div class="tree">{html.escape(tree)}</div>
    </section>

    <section class="page-break">
      <h1>4. Kod źródłowy</h1>
      {''.join(file_sections)}
    </section>
  </div>
</body>
</html>
"""
    out_path = OUTPUT_DIR / "studenckie-pki-dokumentacja.html"
    out_path.write_text(doc, encoding="utf-8")
    return out_path


def ensure_fonts() -> None:
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in FONT_FILES.items():
        target = FONTS_DIR / name
        if target.exists():
            continue
        print(f"Pobieranie czcionki {name}...")
        urllib.request.urlretrieve(url, target)


def generate_pdf(files: list[Path], tree: str) -> Path | None:
    try:
        from fpdf import FPDF
    except ImportError:
        print("Pominięto PDF: zainstaluj fpdf2 (pip install -r scripts/requirements-docs.txt)")
        return None

    try:
        ensure_fonts()
    except Exception as exc:
        print(f"Pominięto PDF: nie udało się pobrać czcionek ({exc})")
        return None

    try:
        return _build_pdf(files, tree, FPDF)
    except Exception as exc:
        print(f"Pominięto PDF: błąd generowania ({exc})")
        return None


def _build_pdf(files: list[Path], tree: str, FPDF) -> Path:
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.set_margins(12, 12, 12)
    pdf.add_font("DejaVu", "", str(FONTS_DIR / "DejaVuSans.ttf"))
    pdf.add_font("DejaVu", "B", str(FONTS_DIR / "DejaVuSans-Bold.ttf"))
    pdf.add_font("DejaVuMono", "", str(FONTS_DIR / "DejaVuSansMono.ttf"))
    page_w = pdf.epw

    def section_title(title: str) -> None:
        pdf.add_page()
        pdf.set_font("DejaVu", "B", 14)
        for chunk in _chunk_text(title, 90):
            pdf.multi_cell(page_w, 8, chunk)
        pdf.ln(3)

    def body_text(text: str, size: int = 10) -> None:
        pdf.set_font("DejaVu", "", size)
        for line in text.splitlines():
            if pdf.get_y() > 280:
                pdf.add_page()
                pdf.set_font("DejaVu", "", size)
            for chunk in _chunk_text(line, 110) or [" "]:
                pdf.multi_cell(page_w, 5, chunk)
        pdf.ln(2)

    def code_block(text: str, size: float = 6.5) -> None:
        pdf.set_font("DejaVuMono", "", size)
        for line in _sanitize_pdf_text(text).splitlines():
            if pdf.get_y() > 280:
                pdf.add_page()
                pdf.set_font("DejaVuMono", "", size)
            for chunk in _chunk_text(line, 100) or [" "]:
                if pdf.get_y() > 280:
                    pdf.add_page()
                    pdf.set_font("DejaVuMono", "", size)
                pdf.multi_cell(page_w, 3.4, chunk)

    # Cover
    pdf.add_page()
    pdf.set_font("DejaVu", "B", 22)
    pdf.multi_cell(page_w, 12, "Studenckie PKI")
    pdf.set_font("DejaVu", "", 12)
    pdf.multi_cell(page_w, 7, "Dokumentacja projektu")
    pdf.multi_cell(page_w, 7, f"Wygenerowano: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    pdf.ln(6)
    pdf.multi_cell(page_w, 7, f"Liczba plikow zrodlowych: {len(files)}")

    section_title("Prezentacja (skrót)")
    presentation = load_presentation_md()
    body_text(presentation[:12000] + ("\n...\n[pełna treść w HTML]" if len(presentation) > 12000 else ""), 9)

    section_title("Struktura plików")
    code_block(tree, 7)

    for path in files:
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        section_title(rel)
        code_block(read_text(path), 6.5)

    out_path = OUTPUT_DIR / "studenckie-pki-dokumentacja.pdf"
    pdf.output(str(out_path))
    return out_path


def main() -> int:
    files = collect_source_files()
    tree = build_tree(files)

    html_path = generate_html(files, tree)
    print(f"HTML: {html_path}")

    print("PDF (z HTML przez przegladarke)...")
    pdf_path = generate_pdf_from_html(html_path)
    if not pdf_path:
        print("PDF (fpdf2)...")
        pdf_path = generate_pdf(files, tree)
    if pdf_path:
        print(f"PDF:  {pdf_path}")

    print("\nGotowe.")
    print("Jesli PDF nie powstal, otworz plik HTML i uzyj Ctrl+P -> Zapisz jako PDF.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
