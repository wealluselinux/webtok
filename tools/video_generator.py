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
import urllib.parse
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


def load_archive() -> set[str]:
    if not ARCHIVE_FILE.exists():
        return set()
    return {line.strip().split()[-1] for line in ARCHIVE_FILE.read_text(encoding="utf-8", errors="ignore").splitlines() if line.strip()}


def mark_archive(vid_id: str):
    with ARCHIVE_FILE.open("a", encoding="utf-8") as f:
        f.write(f"tiktok {vid_id}\n")


def api_json(method: str, path: str, payload: dict):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {e.code} {path}: {body[:200]}") from e


def upload_r2(upload_url: str, mp4_path: Path):
    data = mp4_path.read_bytes()
    req = urllib.request.Request(upload_url, data=data, method="PUT", headers={"Content-Type": "video/mp4"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        if resp.status not in (200, 201, 204):
            raise RuntimeError(f"R2 PUT returned {resp.status}")


def clean_tags(desc: str) -> list[str]:
    tags = ["funny"]
    for m in re.findall(r"#([a-zA-Z0-9_]{1,30})", desc or ""):
        t = m.lower()
        if t not in tags:
            tags.append(t)
        if len(tags) >= 5:
            break
    return tags[:5]


def detect_orientation(w: int, h: int) -> str:
    if w and h:
        if w > h * 1.15:
            return "landscape"
        if abs(w - h) <= max(w, h) * 0.15:
            return "square"
    return "portrait"


def list_user_videos(ytdlp: str, src: str) -> list[dict]:
    cmd = [ytdlp, "--no-warnings", "--ignore-errors", "--flat-playlist", "--playlist-end", "15", "--dump-json", src]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)
    items = []
    for line in (res.stdout or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
            if obj.get("id"):
                items.append(obj)
        except Exception:
            pass
    return items


def download_via_tikwm(video_url: str, dest_mp4: Path) -> dict | None:
    api_url = "https://www.tikwm.com/api/?url=" + urllib.parse.quote(video_url, safe="")
    req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        j = json.loads(resp.read().decode("utf-8"))
    if j.get("code") != 0 or not j.get("data"):
        return None
    d = j["data"]
    play_url = d.get("play") or d.get("wmplay")
    if not play_url:
        return None
    req2 = urllib.request.Request(play_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req2, timeout=120) as r2:
        data = r2.read()
    if len(data) > 50 * 1024 * 1024:
        log("Skipped: video over 50 MB.")
        return None
    dest_mp4.write_bytes(data)
    return {
        "title": d.get("title") or "Funny Video",
        "width": int(d.get("width") or 0),
        "height": int(d.get("height") or 0),
    }


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
    seen = load_archive()

    while RUNNING and (MAX_VIDEOS == 0 or uploaded < MAX_VIDEOS):
        round_num += 1
        src = random.choice(sources)
        log(f"Round {round_num} · Checking {src}")

        for f in DL_DIR.glob("*"):
            try:
                f.unlink()
            except OSError:
                pass

        try:
            items = list_user_videos(ytdlp, src)
        except Exception as e:
            log(f"Playlist check failed: {e}")
            time.sleep(2)
            continue

        unseen = [it for it in items if str(it.get("id")) not in seen]
        if not unseen:
            log(f"No unseen videos from {src}, trying another...")
            time.sleep(2)
            continue

        pick = random.choice(unseen)
        vid_id = str(pick["id"])
        vid_url = pick.get("webpage_url") or pick.get("url") or f"{src}/video/{vid_id}"
        if not vid_url.startswith("http"):
            vid_url = f"{src}/video/{vid_id}"

        mp4 = DL_DIR / f"{vid_id}.mp4"
        info = {"title": pick.get("title") or pick.get("description") or "Funny Video", "width": 0, "height": 0}

        # Try yt-dlp first, then fall back to tikwm if TikTok blocks Render's datacenter IP
        cmd = [ytdlp, "--no-warnings", "--max-filesize", "50m", "-f", "b[ext=mp4]/mp4/best[ext=mp4]/best", "--write-info-json", "-o", str(DL_DIR / "%(id)s.%(ext)s"), vid_url]
        try:
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=90)
        except Exception:
            pass

        if not mp4.exists():
            log(f"Direct yt-dlp blocked on Render, using fallback for {vid_id}...")
            try:
                fb = download_via_tikwm(vid_url, mp4)
                if fb:
                    info.update(fb)
            except Exception as e:
                log(f"Fallback failed: {e}")
        else:
            ip = mp4.with_suffix(".info.json")
            if ip.exists():
                try:
                    j = json.loads(ip.read_text(encoding="utf-8", errors="ignore"))
                    info["title"] = j.get("title") or j.get("description") or info["title"]
                    info["width"] = int(j.get("width") or 0)
                    info["height"] = int(j.get("height") or 0)
                except Exception:
                    pass

        if not mp4.exists():
            log(f"Could not fetch {vid_id}, trying another...")
            time.sleep(2)
            continue

        raw_title = (info.get("title") or "Funny Video").strip()
        title = re.sub(r"\s+", " ", raw_title)[:100] or "Funny Video"
        tags = clean_tags(raw_title)
        orient = detect_orientation(info.get("width", 0), info.get("height", 0))
        rand_name = f"{int(time.time() * 1000)}_{random.randint(10000000, 99999999)}.mp4"
        storage_path = f"{UID}/{rand_name}"

        try:
            presign = api_json("POST", "/api/storage/presign", {"bucket": "videos", "path": storage_path, "contentType": "video/mp4"})
            upload_r2(presign["uploadUrl"], mp4)
            api_json("POST", "/api/db", {
                "table": "videos",
                "op": "insert",
                "returning": True,
                "data": {"title": title, "storage_path": storage_path, "orientation": orient, "hashtags": tags},
            })
            mark_archive(vid_id)
            seen.add(vid_id)
            uploaded += 1
            log(f"Uploaded #{uploaded}: {title[:60]} ({orient}, #{', #'.join(tags)})")
        except Exception as e:
            log(f"Upload failed: {e}")
        finally:
            for f in DL_DIR.glob("*"):
                try:
                    f.unlink()
                except OSError:
                    pass

        if RUNNING and (MAX_VIDEOS == 0 or uploaded < MAX_VIDEOS):
            time.sleep(4)

    log(f"Finished! Total uploaded this run: {uploaded}")


if __name__ == "__main__":
    main()
