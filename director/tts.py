#!/usr/bin/env python
"""TTS 引擎：edge-tts 合成语音 + 生成 timing.json"""
import sys
import json
import asyncio
import os
import subprocess
import edge_tts

VOICE = "zh-CN-YunxiNeural"
RATE = "+0%"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "template", "public", "audio")
DIRECTOR_DIR = os.path.dirname(__file__)

async def synthesize(text_file):
    with open(text_file, "r", encoding="utf-8") as f:
        text = f.read().strip()
    
    if not text:
        print("错误：文案为空")
        sys.exit(1)
    
    # 按标点分句
    import re
    sentences = re.split(r'(?<=[。！？；\n])', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_path = os.path.join(OUTPUT_DIR, "voiceover.mp3")
    
    # 合成完整语音
    communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
    await communicate.save(output_path)
    print(f"✓ 语音合成完成: {output_path}")
    
    # 用 ffprobe 获取真实时长
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", output_path],
        capture_output=True, text=True
    )
    total_duration = float(result.stdout.strip())
    print(f"  总时长: {total_duration:.2f}s")
    
    # 按句子字数比例分配时间
    total_chars = sum(len(s) for s in sentences)
    segments = []
    current_time = 0.0
    fps = 30
    
    for s in sentences:
        char_ratio = len(s) / total_chars
        seg_duration = total_duration * char_ratio
        segments.append({
            "text": s,
            "start": round(current_time, 3),
            "duration": round(seg_duration, 3),
            "duration_frames": int(seg_duration * fps),
        })
        current_time += seg_duration
    
    timing = {
        "fps": fps,
        "total_duration": total_duration,
        "segments": segments,
    }
    
    timing_path = os.path.join(DIRECTOR_DIR, "timing.json")
    with open(timing_path, "w", encoding="utf-8") as f:
        json.dump(timing, f, ensure_ascii=False, indent=2)
    
    print(f"✓ 时间轴生成: {len(segments)} 句 → {timing_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python tts.py <文案文件>")
        sys.exit(1)
    asyncio.run(synthesize(sys.argv[1]))
