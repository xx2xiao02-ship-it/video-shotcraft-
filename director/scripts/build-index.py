# -*- coding: utf-8 -*-
"""
素材库正式索引生成器
- 遍历 _scenes/ 下所有镜头
- 用 ffprobe 读时长/分辨率/帧率
- 按文件夹+文件名粗打标签
- 输出 _index.json
"""
import os, json, subprocess, sys, re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(r"E:\video-shotcraft\materials")
SCENES = ROOT / "_scenes"
OUT = ROOT / "_index.json"

# 粗标签规则
def guess_tags(rel_path: str, category: str):
    tags = set()
    name = os.path.basename(rel_path).lower()
    cat = category.lower()
    # 大分类
    if "商务" in cat: tags.add("商务")
    if "科技" in cat or "ai" in cat or "互联" in cat or "电子" in cat: tags.add("科技")
    if "城市" in cat or "高楼" in cat or "车流" in cat: tags.add("城市")
    if "家庭" in cat or "孩子" in cat or "老年" in cat: tags.add("家庭")
    # 细分
    if re.search(r"握手|合作|洽谈", name): tags.add("合作握手")
    if re.search(r"会议|开会|办公|报告|研讨", name): tags.add("会议办公")
    if re.search(r"签字|签约", name): tags.add("签约")
    if re.search(r"建筑|高楼|大厦", name): tags.add("建筑")
    if re.search(r"车流|交通|公路|马路", name): tags.add("车流")
    if re.search(r"数据|屏幕|全息|代码|服务器|芯片", name): tags.add("数据科技")
    if re.search(r"老人|老年|家庭|笑脸|幸福", name): tags.add("家庭温情")
    if re.search(r"成功|总裁|精英|高端", name): tags.add("高端精英")
    return sorted(tags)

def probe_one(filepath: Path):
    rel = str(filepath.relative_to(SCENES))
    category = rel.split(os.sep)[0]
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", "-show_streams", str(filepath)],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(r.stdout)
        dur = float(data.get("format", {}).get("duration", 0))
        vs = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
        w = vs.get("width", 0)
        h = vs.get("height", 0)
        fps_raw = vs.get("r_frame_rate", "30/1")
        try:
            num, den = fps_raw.split("/")
            fps = round(int(num) / int(den), 1) if int(den) else 30
        except:
            fps = 30
    except Exception as e:
        dur = 0; w = 0; h = 0; fps = 30
    return {
        "path": rel,
        "category": category,
        "duration_sec": round(dur, 2),
        "width": w,
        "height": h,
        "fps": fps,
        "size_kb": round(filepath.stat().st_size / 1024),
        "tags": guess_tags(rel, category)
    }

def main():
    files = list(SCENES.rglob("*"))
    files = [f for f in files if f.is_file() and f.suffix.lower() in (".mp4", ".mov", ".webm")]
    print(f"找到 {len(files)} 个镜头")
    results = []
    done = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(probe_one, f): f for f in files}
        for fut in as_completed(futs):
            results.append(fut.result())
            done += 1
            if done % 200 == 0:
                print(f"  {done}/{len(files)}")
    results.sort(key=lambda x: x["path"])
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"完成: {len(results)} 条 -> {OUT}")

if __name__ == "__main__":
    main()
