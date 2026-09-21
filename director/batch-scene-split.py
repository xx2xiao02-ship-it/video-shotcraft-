"""
批量镜头分割：遍历 E:\素材 下所有视频，拆成单个镜头
输出到 E:\video-shotcraft\materials\_scenes\
"""
import os, subprocess, sys

INPUT_ROOT = r"E:\素材"
OUTPUT_ROOT = r"E:\video-shotcraft\materials\_scenes"
PYTHON = r"C:\Users\Administrator\AppData\Local\Python\bin\python.exe"

# 收集所有视频
videos = []
for root, dirs, files in os.walk(INPUT_ROOT):
    for f in files:
        if f.lower().endswith((".mp4", ".mov", ".webm")):
            videos.append(os.path.join(root, f))

print(f"找到 {len(videos)} 个视频")
os.makedirs(OUTPUT_ROOT, exist_ok=True)

# 处理每个视频
for i, video in enumerate(videos):
    rel = os.path.relpath(video, INPUT_ROOT)
    # 用相对路径当子文件夹，避免重名
    out_dir = os.path.join(OUTPUT_ROOT, os.path.dirname(rel))
    os.makedirs(out_dir, exist_ok=True)
    
    print(f"\n[{i+1}/{len(videos)}] {rel}")
    result = subprocess.run(
        [PYTHON, "-m", "scenedetect", "-i", video, "-o", out_dir,
         "detect-content", "split-video", "-q"],
        capture_output=True, text=True
    )
    # 统计拆了几个镜头
    lines = result.stdout.split("\n")
    for line in lines:
        if "Detected" in line and "scenes" in line:
            print(f"  → {line.strip()}")

print(f"\n✓ 全部完成！")
