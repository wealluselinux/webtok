#!/usr/bin/env python3
"""
Web Tok bulk uploader: sends a folder of videos you own (or have permission to post) to your site.

  pip install requests
  python tools/bulk_upload.py ~/my-videos --email you@example.com --tags funny,cats
  python tools/bulk_upload.py ~/my-videos --email you@example.com --tags funny --compress

Optional videos.csv in the folder (filename,title,hashtags) sets a title and 1-5 hashtags per file.
Already-uploaded files are remembered in .uploaded.json, so re-running is safe.
Needs ffmpeg/ffprobe only for --compress and for detecting portrait/landscape.
"""
import argparse, csv, getpass, json, os, re, subprocess, sys, tempfile, time
import requests

SITE = os.environ.get("WT_SITE", "https://webtok.onrender.com").rstrip("/")
MAX_BYTES = 50 * 1024 * 1024
EXTS = (".mp4", ".mov", ".webm", ".m4v")
CT = {".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm"}

def parse_tags(s):
    out = []
    for t in re.findall(r"[a-z0-9_]{1,30}", (s or "").lower()):
        if t not in out: out.append(t)
    return out

def orientation(path):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path],
                           capture_output=True, text=True, timeout=30)
        w, h = [int(x) for x in r.stdout.strip().split(",")[:2]]
        return "square" if abs(w - h) < 0.1 * max(w, h) else ("landscape" if w > h else "portrait")
    except Exception:
        return "portrait"

def compress(path):
    out = os.path.join(tempfile.mkdtemp(), "out.mp4")
    subprocess.run(["ffmpeg", "-y", "-i", path, "-vf", "scale=-2:720", "-c:v", "libx264", "-crf", "28", "-preset", "slow",
                    "-movflags", "+faststart", "-c:a", "aac", "-b:a", "96k", out], check=True, capture_output=True)
    return out

def main():
    ap = argparse.ArgumentParser(description="Bulk upload videos to Web Tok")
    ap.add_argument("folder")
    ap.add_argument("--email", required=True)
    ap.add_argument("--tags", default="", help="default hashtags, comma separated (1 to 5)")
    ap.add_argument("--compress", action="store_true", help="shrink to 720p first (recommended)")
    ap.add_argument("--site", default=SITE)
    a = ap.parse_args()
    site = a.site.rstrip("/")

    pw = os.environ.get("WT_PASSWORD") or getpass.getpass("Web Tok password: ")
    r = requests.post(f"{site}/api/auth/login", json={"email": a.email, "password": pw}, timeout=30)
    if r.status_code != 200:
        sys.exit("Sign in failed: " + (r.json().get("error", {}).get("message", r.text)))
    sess = r.json()["data"]["session"]
    uid = sess["user"]["id"]
    H = {"Authorization": f"Bearer {sess['access_token']}", "Content-Type": "application/json"}

    meta = {}
    cp = os.path.join(a.folder, "videos.csv")
    if os.path.exists(cp):
        with open(cp, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f): meta[row["filename"].strip()] = row
    log = os.path.join(a.folder, ".uploaded.json")
    done = set(json.load(open(log))) if os.path.exists(log) else set()

    ok = 0
    for i, name in enumerate(sorted(f for f in os.listdir(a.folder) if f.lower().endswith(EXTS))):
        if name in done: print(f"skip   {name} (already uploaded)"); continue
        row = meta.get(name, {})
        tags = parse_tags(row.get("hashtags") or a.tags)
        if not 1 <= len(tags) <= 5:
            print(f"SKIP   {name}: needs 1 to 5 hashtags (use --tags or videos.csv)"); continue
        src, tmp = os.path.join(a.folder, name), None
        try:
            if a.compress: print(f"shrink {name} ..."); src = tmp = compress(src)
            size = os.path.getsize(src)
            if size > MAX_BYTES: print(f"SKIP   {name}: {size/1e6:.0f} MB is over 50 MB (try --compress)"); continue
            ct = "video/mp4" if tmp else CT.get(os.path.splitext(name)[1].lower(), "video/mp4")
            path = f"{uid}/{int(time.time()*1000)}_{i}{'.mp4' if ct == 'video/mp4' else os.path.splitext(name)[1].lower()}"
            pre = requests.post(f"{site}/api/storage/presign", headers=H, json={"bucket": "videos", "path": path, "contentType": ct}, timeout=30)
            if pre.status_code != 200: print("FAIL   presign:", pre.text); continue
            print(f"upload {name} ({size/1e6:.1f} MB) ...")
            with open(src, "rb") as fh:
                up = requests.put(pre.json()["uploadUrl"], data=fh, headers={"Content-Type": ct}, timeout=900)
            if up.status_code not in (200, 201): print("FAIL   upload:", up.status_code, up.text[:200]); continue
            title = (row.get("title") or re.sub(r"[-_]+", " ", os.path.splitext(name)[0])).strip()[:100]
            ins = requests.post(f"{site}/api/db", headers=H, json={"table": "videos", "op": "insert",
                                "data": {"title": title, "storage_path": path, "orientation": orientation(src), "hashtags": tags}}, timeout=30)
            if ins.status_code != 200 or ins.json().get("error"): print("FAIL   save:", ins.text); continue
            done.add(name); ok += 1; json.dump(sorted(done), open(log, "w"))
            print(f"done   {name}  #{' #'.join(tags)}")
        finally:
            if tmp and os.path.exists(tmp): os.remove(tmp)
    print(f"\nUploaded {ok} video(s).")

if __name__ == "__main__":
    main()
