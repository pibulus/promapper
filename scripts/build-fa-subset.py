"""Build a self-hosted Font Awesome subset containing only the icons ProMapper
actually uses. Replaces a 156KB CDN font + 103KB CDN stylesheet with a local
pair a fraction of the size, and removes a third-party origin from the app."""

import re
import subprocess
import sys
from pathlib import Path

SCRATCH = Path(__file__).parent  # expects fa-all.css + the two woff2 files here
APP = Path(__file__).resolve().parent.parent
CSS_SRC = SCRATCH / "fa-all.css"

# 1. every fa-* class the app actually references
used = set()
for path in APP.rglob("*"):
    if path.is_dir() or "node_modules" in path.parts or path.suffix in {".css", ".md", ".lock"}:
        continue
    try:
        text = path.read_text(errors="ignore")
    except (OSError, UnicodeDecodeError):
        continue
    used.update(re.findall(r"\bfa-[a-z0-9-]+\b", text))

css = CSS_SRC.read_text()

# 2. map class -> codepoint from FA's own rules: .fa-check::before{content:"\f00c"}
cp_by_class = {}
for m in re.finditer(r"\.fa-([a-z0-9-]+):+before\{content:\"\\([0-9a-fA-F]+)\"", css):
    cp_by_class.setdefault("fa-" + m.group(1), m.group(2))

wanted = {c: cp_by_class[c] for c in sorted(used) if c in cp_by_class}
if not wanted:
    sys.exit("no icon classes resolved — FA css format changed?")

print(f"referenced fa-* tokens: {len(used)}")
print(f"resolved to real icons: {len(wanted)}")

# 3. subset each weight to just those codepoints
unicodes = ",".join("U+" + cp for cp in sorted(set(wanted.values())))
out_dir = APP / "static/fonts"
out_dir.mkdir(parents=True, exist_ok=True)

py = SCRATCH / "fa-venv/bin/python"  # python -m venv fa-venv && fa-venv/bin/pip install fonttools brotli
for weight, src in (("solid", "fa-solid-900.woff2"), ("regular", "fa-regular-400.woff2")):
    src_path = SCRATCH / src
    dst = out_dir / src
    subprocess.run(
        [str(py), "-m", "fontTools.subset", str(src_path),
         f"--unicodes={unicodes}", "--flavor=woff2", "--layout-features=",
         f"--output-file={dst}"],
        check=True, capture_output=True,
    )
    before, after = src_path.stat().st_size, dst.stat().st_size
    print(f"{weight:8} {before:>7,}b -> {after:>6,}b  ({100 - after * 100 // before}% smaller)")

# 4. a stylesheet with ONLY what's used — @font-face + the icon rules
rules = "\n".join(
    f'.{cls}::before{{content:"\\{cp}"}}' for cls, cp in sorted(wanted.items())
)
sheet = f"""/* Font Awesome Free 6.5.2 — self-hosted subset, {len(wanted)} icons.
 * Generated, do not hand-edit: scratch/fa-subset.py rebuilds it.
 * Replaces the cdnjs stylesheet (103KB) + full solid font (156KB). Adding a
 * NEW fa-* icon to the app means re-running the generator, otherwise the
 * glyph is missing from the subset and renders as a blank box.
 * Icons: CC BY 4.0 · Fonts: SIL OFL 1.1 · Code: MIT — https://fontawesome.com/license/free
 */
@font-face{{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:900;font-display:swap;src:url(/fonts/fa-solid-900.woff2) format("woff2")}}
@font-face{{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/fa-regular-400.woff2) format("woff2")}}
.fa,.fas,.fa-solid,.far,.fa-regular{{-moz-osx-font-smoothing:grayscale;-webkit-font-smoothing:antialiased;display:var(--fa-display,inline-block);font-style:normal;font-variant:normal;line-height:1;text-rendering:auto;font-family:"Font Awesome 6 Free"}}
.fa,.fas,.fa-solid{{font-weight:900}}
.far,.fa-regular{{font-weight:400}}
.fa-fw{{text-align:center;width:1.25em}}
.fa-spin{{animation-name:fa-spin;animation-duration:2s;animation-iteration-count:infinite;animation-timing-function:linear}}
@keyframes fa-spin{{0%{{transform:rotate(0)}}100%{{transform:rotate(360deg)}}}}
@media(prefers-reduced-motion:reduce){{.fa-spin{{animation-delay:-1ms;animation-duration:1ms;animation-iteration-count:1}}}}
{rules}
"""
sheet_path = APP / "static/fa-subset.css"
sheet_path.write_text(sheet)
print(f"stylesheet {len(sheet):,}b -> static/fa-subset.css")
