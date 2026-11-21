#!/usr/bin/env python3
"""Video Generator 3000: pulls random TikTok videos from tools/users.txt and uploads them to Web Tok."""
import json
import os
import random
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("WT_URL", "http://127.0.0.1:3000").rstrip("/")
TOKEN = os.environ.get("WT_BOT_TOKEN", "").strip()
UID = os.environ.get("WT_BOT_UID", "").strip()
MAX_VIDEOS = int(os.environ.get("WT_MAX_VIDEOS", "0") or "0")
WORK_DIR = Path(os.environ.get("WT_WORK_DIR", "/tmp/vg3000"))
DL_DIR = WORK_DIR / "dl"
ARCHIVE_FILE = WORK_DIR / "downloaded.txt"
USERS_FILE = Path(os.environ.get("WT_USERS_FILE", Path(__file__).parent / "users.txt"))

RUNNING = True


def log(msg: str):
    print(f"[vg3000] {msg}", flush=True)


def stop_handler(_sig, _frame):
    global RUNNING
    RUNNING = False
    log("Stopping after current step...")


signal.signal(signal.SIGTERM, stop_handler)
signal.signal(signal.SIGINT, stop_handler)


def ensure_ytdlp() -> str:
    found = shutil.which("yt-dlp")
    if found:
        return found
    local_bin = WORK_DIR / "yt-dlp"
    if local_bin.exists() and os.access(local_bin, os.X_OK):
        return str(local_bin)
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
    log("Downloading yt-dlp binary...")
    urllib.request.urlretrieve(url, local_bin)
    os.chmod(local_bin, 0o755)
    log("yt-dlp ready.")
    return str(local_bin)


def load_sources() -> list[str]:
    if not USERS_FILE.exists():
        return []
    out = []
    for raw in USERS_FILE.read_text(encoding="utf-8", errors="ignore").splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        if s.startswith("http://") or s.startswith("https://"):
            out.append(s)
        else:
            out.append(f"https://www.tiktok.com/@{s.lstrip('@')}")
    return out


def api_json(method: str, path: str, payload: dict):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code} {path}: {body[:200]}") from e


def upload_r2(upload_url: str, mp4_path: Path):
    data = mp4_path.read_bytes()
    req = urllib.request.Request(
        upload_url,
        data=data,
        method="PUT",
        headers={"Content-Type": "video/mp4"},
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        if resp.status not in (200, 201, 204):
            raise RuntimeError(f"R2 PUT returned {resp.status}")


def clean_tags(info: dict) -> list[str]:
    tags = ["funny"]
    desc = f"{info.get('title', '')} {info.get('description', '')}"
    for m in re.findall(r"#([a-zA-Z0-9_]{1,30})", desc):
        t = m.lower()
        if t not in tags:
            tags.append(t)
        if len(tags) >= 5:
            break
    return tags[:5]


def detect_orientation(info: dict) -> str:
    w = info.get("width") or 0
    h = info.get("height") or 0
    if w and h:
        if w > h * 1.15:
            return "landscape"
        if abs(w - h) <= max(w, h) * 0.15:
            return "square"
    return "portrait"


def main():
    if not TOKEN or not UID:
        log("Missing WT_BOT_TOKEN or WT_BOT_UID.")
        sys.exit(1)

    WORK_DIR.mkdir(parents=True, exist_ok=True)
    DL_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE_FILE.touch(exist_ok=True)

    ytdlp = ensure_ytdlp()
    sources = load_sources()
    if not sources:
        log("No users found in users.txt.")
        sys.exit(1)

    log(f"Started with {len(sources)} source(s). Max videos: {MAX_VIDEOS or 'unlimited'}")
    uploaded = 0
    round_num = 0

    while RUNNING and (MAX_VIDEOS == 0 or uploaded < MAX_VIDEOS):
        round_num += 1
        src = random.choice(sources)
        log(f"Round {round_num} · Picking random video from {src}")

        for f in DL_DIR.glob("*"):
            try:
                f.unlink()
            except OSError:
                pass

        cmd = [
            ytdlp,
            "--no-warnings",
            "--ignore-errors",
            "--playlist-random",
            "--playlist-end", "15",
            "--max-downloads", "1",
            "--download-archive", str(ARCHIVE_FILE),
            "--max-filesize", "50m",
            "-f", "b[ext=mp4]/mp4/best[ext=mp4]/best",
            "--write-info-json",
            "-o", str(DL_DIR / "%(id)s.%(ext)s"),
            src,
        ]
        yt_out = ""
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=180)
            yt_out = res.stdout or ""
        except Exception as e:
            log(f"yt-dlp error: {e}")

        mp4s = list(DL_DIR.glob("*.mp4")) or [p for p in DL_DIR.glob("*") if p.suffix.lower() in (".mp4", ".webm", ".mov") and not p.name.endswith(".part")]
        if not mp4s:
            err_lines = [ln.strip() for ln in yt_out.splitlines() if "ERROR" in ln or "Sign in" in ln or "blocked" in ln.lower()]
            if err_lines:
                log(f"yt-dlp: {err_lines[-1][:180]}")
            else:
                log(f"No new video downloaded from {src}, trying another...")
            time.sleep(2)
            continue

        mp4 = mp4s[0]
        info_path = mp4.with_suffix(".info.json")
        info = {}
        if info_path.exists():
            try:
                info = json.loads(info_path.read_text(encoding="utf-8", errors="ignore"))
            except Exception:
                pass

        raw_title = (info.get("title") or info.get("description") or "Funny Video").strip()
        title = re.sub(r"\s+", " ", raw_title)[:100] or "Funny Video"
        tags = clean_tags(info)
        orient = detect_orientation(info)
        rand_name = f"{int(time.time() * 1000)}_{random.randint(10000000, 99999999)}.mp4"
        storage_path = f"{UID}/{rand_name}"

        try:
            presign = api_json("POST", "/api/storage/presign", {
                "bucket": "videos",
                "path": storage_path,
                "contentType": "video/mp4",
            })
            upload_r2(presign["uploadUrl"], mp4)
            api_json("POST", "/api/db", {
                "table": "videos",
                "op": "insert",
                "returning": True,
                "data": {
                    "title": title,
                    "storage_path": storage_path,
                    "orientation": orient,
                    "hashtags": tags,
                },
            })
            uploaded += 1
            log(f"Uploaded #{uploaded}: {title[:60]} ({orient}, #{', #'.join(tags)})")
        except Exception as e:
            log(f"Upload failed: {e}")
        finally:
            for f in (mp4, info_path):
                try:
                    if f.exists():
                        f.unlink()
                except OSError:
                    pass

        if RUNNING and (MAX_VIDEOS == 0 or uploaded < MAX_VIDEOS):
            time.sleep(4)

    log(f"Finished! Total uploaded this run: {uploaded}")


if __name__ == "__main__":
    main()
