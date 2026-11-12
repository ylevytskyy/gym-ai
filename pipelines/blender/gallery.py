"""Build out/index.html: one page that plays every rendered exercise loop.

Usage:
  python3 pipelines/blender/gallery.py [--out ./out]

render.py calls this after every full render, so the page stays current.
Open out/index.html in a browser; it needs no server.
"""

import argparse
import html
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
GROUPS = {"warm_up": "Warm-up", "lower_body": "Lower body", "upper_body": "Upper body",
          "core": "Core", "cardio": "Cardio"}

PAGE = """<!doctype html>
<meta charset="utf-8">
<title>Exercise animations</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 24px; background: #f4f4f4; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }}
  figure {{ margin: 0; background: #fff; border-radius: 8px; padding: 8px; }}
  video {{ width: 100%; border-radius: 4px; }}
  figcaption {{ font-size: 14px; padding-top: 4px; }}
  small {{ color: #888; }}
</style>
<h1>Exercise animations <small>{count} loops</small></h1>
{sections}
"""


def catalog():
    """Exercise ids in catalog order -> (group, English name)."""
    with open(os.path.join(ROOT, "catalog", "exercises.json")) as f:
        exercises = json.load(f)["exercises"]
    with open(os.path.join(ROOT, "catalog", "locales", "en.json")) as f:
        names = json.load(f)
    return {e["id"].replace("-", "_"): (e["group"], names.get(e["name_key"], e["id"])) for e in exercises}


def build(out):
    out = os.path.abspath(out)
    known = catalog()
    rendered = sorted(d for d in os.listdir(out) if os.path.isdir(os.path.join(out, d)))
    order = list(known) + [d for d in rendered if d not in known]
    by_group, count = {}, 0
    for ex in order:
        views = sorted(v for v in os.listdir(os.path.join(out, ex))
                       if os.path.isfile(os.path.join(out, ex, v, "loop.mp4"))) if ex in rendered else []
        group, name = known.get(ex, ("other", ex))
        for view in views:
            src = f"{ex}/{view}/loop.mp4"
            by_group.setdefault(group, []).append(
                f'<figure><video src="{src}" poster="{ex}/{view}/poster.jpg" autoplay muted loop playsinline></video>'
                f"<figcaption>{html.escape(name)} <small>{view.replace('_', ' ')}</small></figcaption></figure>")
            count += 1
        if not views:
            by_group.setdefault(group, []).append(
                f"<figure><figcaption>{html.escape(name)} <small>not rendered</small></figcaption></figure>")
    sections = "\n".join(f"<h2>{GROUPS.get(g, g.title())}</h2>\n<div class=grid>\n" + "\n".join(items) + "\n</div>"
                         for g, items in sorted(by_group.items(), key=lambda kv: list(GROUPS).index(kv[0])
                                                if kv[0] in GROUPS else len(GROUPS)))
    path = os.path.join(out, "index.html")
    with open(path, "w") as f:
        f.write(PAGE.format(count=count, sections=sections))
    print(f"GALLERY {path} ({count} loops)")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=os.environ.get("OUTPUT_DIR", "./out"))
    build(p.parse_args().out)
