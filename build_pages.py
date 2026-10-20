# coding: utf-8
from pathlib import Path
root = Path(__file__).resolve().parent
source = (root / "dist/index.html").read_text(encoding="utf-8")
old = "if(savedPrefs.mode==='demo')MODE='demo';"
if source.count(old) != 1:
    raise RuntimeError("Demo entry marker changed; review before publishing")
page = source.replace(old, "if(savedPrefs.mode!=='work')MODE='demo';")
page = page.replace("xuji.headhunter.", "xuji.headhunter.pages-v07.")
page = page.replace("LOCK='xuji-headhunter-work'", "LOCK='xuji-headhunter-pages-work'")
page = page.replace("LOCK='xuji-headhunter-'+MODE", "LOCK='xuji-headhunter-pages-'+MODE")
(root / "docs").mkdir(exist_ok=True)
(root / "docs/index.html").write_text(page, encoding="utf-8")
(root / "docs/.nojekyll").write_text("", encoding="utf-8")
print("Built docs/index.html with synthetic demo default")
