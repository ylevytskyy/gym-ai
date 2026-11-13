"""Upload rendered exercise loops to Supabase Storage (bucket exercise-media).

For every exercise in catalog/exercises.json this takes out/<id>/<view>/loop.mp4 and
poster.jpg and uploads them under the file names the catalog's `media` block uses
(for example squat.mp4, squat.jpg), replacing what is there.

    SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=... python3 publish.py

The secret key is read from the environment only and is never printed.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

BUCKET = "exercise-media"
TYPES = {".mp4": "video/mp4", ".jpg": "image/jpeg"}


def rendered(out, exercise_id):
    """The first view folder of an exercise that holds both a loop and a poster."""
    folder = os.path.join(out, exercise_id.replace("-", "_"))
    if not os.path.isdir(folder):
        return None
    for view in sorted(os.listdir(folder)):
        loop = os.path.join(folder, view, "loop.mp4")
        poster = os.path.join(folder, view, "poster.jpg")
        if os.path.isfile(loop) and os.path.isfile(poster):
            return loop, poster
    return None


def upload(url, key, name, path):
    with open(path, "rb") as f:
        data = f.read()
    request = urllib.request.Request(
        f"{url}/storage/v1/object/{BUCKET}/{name}",
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": TYPES[os.path.splitext(name)[1]],
            "x-upsert": "true",
            "Cache-Control": "public, max-age=86400",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.status


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--out", default=os.path.join(here, "out"))
    p.add_argument("--catalog", default=os.path.join(here, "..", "..", "catalog", "exercises.json"))
    p.add_argument("--dry-run", action="store_true", help="list what would be uploaded")
    args = p.parse_args()

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SECRET_KEY", "")
    if not args.dry_run and (not url or not key):
        sys.exit("Set SUPABASE_URL and SUPABASE_SECRET_KEY.")

    with open(args.catalog) as f:
        exercises = json.load(f)["exercises"]

    missing, failed, done = [], [], 0
    for exercise in exercises:
        files = rendered(args.out, exercise["id"])
        if not files:
            missing.append(exercise["id"])
            continue
        for name, path in ((exercise["media"]["video"], files[0]), (exercise["media"]["poster"], files[1])):
            if args.dry_run:
                print(f"{path} -> {BUCKET}/{name}")
                done += 1
                continue
            try:
                upload(url, key, name, path)
                done += 1
            except urllib.error.HTTPError as e:
                failed.append(f"{name}: HTTP {e.code}")
            except urllib.error.URLError as e:
                failed.append(f"{name}: {e.reason}")

    verb = "WOULD PUBLISH" if args.dry_run else "PUBLISHED"
    print(f"{verb} {done} files for {len(exercises) - len(missing)} of {len(exercises)} exercises")
    if missing:
        print("NOT RENDERED: " + ", ".join(missing))
    if failed:
        print("FAILED: " + "; ".join(failed))
    sys.exit(1 if failed or missing else 0)


if __name__ == "__main__":
    main()
