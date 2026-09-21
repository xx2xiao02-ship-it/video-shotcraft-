import json, base64
from pathlib import Path

root = Path(r"E:\video-shotcraft")
with open(root / "director" / "storyboard.json", encoding="utf-8") as f:
    sb = json.load(f)

shots = sb["shots"]
fps = 30
mode = sb.get("global", {}).get("mode", "A")
total_dur = sum(sh["durationInFrames"] for sh in shots) / fps
thumb_dir = root / "director" / "thumbs"

from collections import defaultdict
groups = defaultdict(list)
for sh in shots:
    groups[sh.get("type", "proof")].append(sh)

type_cn = {"hook": "钩子", "pain": "痛点", "claim": "论点", "proof": "论据", "quote": "金句", "cta": "行动"}
type_color = {"hook": "#f472b6", "pain": "#fbbf24", "claim": "#60a5fa", "proof": "#4ade80", "quote": "#e879f9", "cta": "#4ade80"}
subject_color = {"remotion": "#4ade80", "local-material": "#60a5fa", "aigc-material": "#f472b6", "person": "#fbbf24"}

def get_thumb(card):
    p = thumb_dir / (card.replace("/", "__") + ".png")
    if p.exists() and p.stat().st_size > 5000:
        return "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()
    return None

cards_html = ""
for type_key in ["hook", "pain", "claim", "proof", "quote", "cta"]:
    if type_key not in groups:
        continue
    gs = groups[type_key]
    color = type_color[type_key]
    g_dur = sum(s["durationInFrames"] for s in gs) / fps
    cards_html += f'<h2 style="margin:28px 0 12px;color:#e8e6e1;font-size:18px;">{type_cn[type_key]}段 <span style="font-size:13px;color:#888;font-weight:normal">({len(gs)}镜头 · {g_dur:.1f}s)</span></h2>'

    for sh in gs:
        subj = sh["pit"]["subject"]
        sc = subject_color.get(subj, "#888")
        pos = sh["pit"]["position"]
        dur = sh["durationInFrames"] / fps
        card = sh["shotCard"]
        material = sh.get("material", "")
        mat_short = material.split("\\")[-1][:22] if material else "—"
        loop = sh["pit"].get("loop", False)
        thumb = get_thumb(card)
        if thumb:
            thumb_html = f'<img src="{thumb}" style="width:180px;border-radius:6px;margin-bottom:8px;">'
        else:
            thumb_html = '<div style="width:180px;height:101px;background:#222;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#666;font-size:11px;margin-bottom:8px;">no thumb</div>'

        cards_html += f'''
        <div style="background:#1a1d24;border-radius:10px;padding:14px;margin-bottom:10px;border-left:4px solid {color};display:flex;gap:14px;">
          <div>{thumb_html}</div>
          <div style="flex:1;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:12px;color:#888;">⏱ {dur:.1f}s</span>
              <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:{sc}22;color:{sc};">{subj}</span>
            </div>
            <div style="font-size:14px;color:#e8e6e1;margin-bottom:6px;line-height:1.5;">"{sh["text"]}"</div>
            <div style="font-size:11px;color:#888;display:flex;gap:10px;flex-wrap:wrap;">
              <span>📋 {card.split("/")[-1]}</span>
              <span>🏷️ {sh["l2"]}</span>
              <span>{'🖼️ 背景' if pos == 'background' else '📦 元素'}</span>
              {f'<span>🔁 loop</span>' if loop else ''}
              <span>🎬 {mat_short}</span>
            </div>
          </div>
        </div>
        '''

timeline = "".join(f'<div style="width:{sh["durationInFrames"]/total_dur*100}%;background:{type_color.get(sh["type"],"#888")};height:24px;" title="{sh["text"][:20]}"></div>' for sh in shots)

html = f'''<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>分镜脚本审查 · {mode}模式 · {len(shots)}镜头 · {total_dur:.1f}s</title>
<style>body{{background:#0d0f14;font-family:"Microsoft YaHei",sans-serif;max-width:860px;margin:0 auto;padding:20px;}}
h1{{color:#e8e6e1;font-size:20px;}}
.meta{{color:#888;font-size:13px;margin-bottom:16px;}}
.timeline{{display:flex;border-radius:6px;overflow:hidden;margin-bottom:24px;height:24px;}}
</style></head><body>
<h1>分镜脚本审查</h1>
<div class="meta">模式: <b style="color:#4ade80">{mode}</b> · 总镜头: {len(shots)} · 总时长: {total_dur:.1f}s</div>
<div class="timeline">{timeline}</div>
{cards_html}
</body></html>'''

out = root / "director" / "storyboard-review.html"
out.write_text(html, encoding="utf-8")
print("OK", out)
