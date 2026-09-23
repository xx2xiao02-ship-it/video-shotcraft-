import subprocess, json
from pathlib import Path

root = Path(r"E:\video-shotcraft")
td = root / "template"
tdir = root / "director" / "thumbs"
tdir.mkdir(exist_ok=True)

with open(root / "director" / "taxonomy.json", encoding="utf-8") as f:
    t = json.load(f)
cards = sorted(set(c for v in t["levels"]["L3"].values() for c in v))
print("Total", len(cards))

chrome = r"C:\Users\Administrator\AppData\Local\Google\Chrome\Application\chrome.exe"
rem = str(td / "node_modules" / ".bin" / "remotion.cmd")

done = skip = fail = 0
for card in cards:
    out = tdir / (card.replace("/", "__") + ".png")
    if out.exists() and out.stat().st_size > 5000:
        skip += 1
        continue
    props = json.dumps({
        "storyboard": {
            "shots": [{"shotCard": card, "text": "Preview", "durationInFrames": 90}],
            "style": {"bg": "#0d0f14", "text": "#e8e6e1", "accent": "#d4a853", "sub": "#888", "captionStyle": "pill"},
        }
    })
    cmd = [rem, "still", "src/index.ts", "DynamicVideo", str(out),
           "--props=" + props, "--frame=45", "--browser-executable=" + chrome]
    try:
        r = subprocess.run(cmd, cwd=str(td), capture_output=True, text=True, timeout=60)
        if out.exists() and out.stat().st_size > 5000:
            done += 1
            print("OK", card)
        else:
            fail += 1
            err = r.stderr[-150:] if r.stderr else "no stderr"
            print("FAIL", card, err)
    except Exception as e:
        fail += 1
        print("ERR", card, str(e)[:80])

print("Done:", done, "ok,", skip, "skip,", fail, "fail")
