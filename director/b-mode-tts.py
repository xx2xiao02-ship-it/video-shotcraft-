#!/usr/bin/env python
"""B-mode narration timing; output remains isolated per run."""
import argparse
import asyncio
from array import array
import json
import math
import os
import re
import subprocess
import sys
import wave
from pathlib import Path

import edge_tts

FPS = 30
DEFAULT_VOICE = "zh-CN-YunxiNeural"
VOICES = {DEFAULT_VOICE, "zh-CN-XiaoxiaoNeural"}


def split_sentences(text, split_long_clauses=True):
    """Keep every original character, splitting long clauses only at meaningful pauses."""
    chunks = [s.strip() for s in re.findall(r"[^。！？!?\n]+[。！？!?]?", text) if s.strip()]
    sentences = []
    for chunk in chunks:
        if split_long_clauses and len(chunk) > 40 and len(re.findall(r"(?:第一|第二|第三|首先|其次|最后|[一二三]、|\d+[、.．])", chunk)) < 2:
            clauses = [s.strip() for s in re.findall(r"[^，,：:]+[，,：:]?", chunk) if s.strip()]
            if len(clauses) > 1:
                sentences.extend(clauses)
                continue
        sentences.append(chunk)
    if not sentences:
        raise ValueError("文案为空")
    return sentences


def distribute_frames(sentences, total_frames, levels, boundaries=None):
    if total_frames < len(sentences):
        raise ValueError("音频太短，无法为每句话分配一帧")
    weights = [max(1, len(re.sub(r"\W", "", s))) for s in sentences]
    if boundaries is not None:
        cuts = [0] + boundaries + [total_frames]
        method = "edge_sentence_boundary"
    else:
        # Constrain estimates to a local quiet point. This is still an estimate,
        # especially if a speaker does not pause between clauses.
        cuts = [0]
        for i in range(len(sentences) - 1):
            remaining = sum(weights[i:])
            estimate = cuts[-1] + round((total_frames - cuts[-1]) * weights[i] / remaining)
            low = max(cuts[-1] + 1, estimate - 18)
            high = min(total_frames - (len(sentences) - i - 1), estimate + 18)
            if low > high:
                low = high = min(total_frames - (len(sentences) - i - 1), cuts[-1] + 1)
            # Small average windows favor real pauses over incidental zero crossings.
            cuts.append(min(range(low, high + 1), key=lambda f: (
                sum(levels[max(0, f - 2):min(len(levels), f + 3)]) / max(1, min(len(levels), f + 3) - max(0, f - 2)),
                abs(f - estimate) * 0.003,
            )))
        cuts.append(total_frames)
        method = "audio_pause_assisted_estimate"
    return ([{"text": s, "fromFrame": cuts[i], "durationInFrames": cuts[i + 1] - cuts[i]}
             for i, s in enumerate(sentences)], method)


def sample_audio_levels(audio, total_frames):
    decoded = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(audio), "-ac", "1", "-ar", "12000",
         "-f", "s16le", "-acodec", "pcm_s16le", "pipe:1"],
        check=True, capture_output=True,
    )
    samples = array("h")
    samples.frombytes(decoded.stdout[:len(decoded.stdout) // 2 * 2])
    samples_per_frame = 12000 // FPS
    raw = []
    for frame in range(total_frames):
        chunk = samples[frame * samples_per_frame:(frame + 1) * samples_per_frame]
        raw.append(math.sqrt(sum(value * value for value in chunk) / len(chunk)) / 32768 if chunk else 0)
    p95 = sorted(raw)[int((len(raw) - 1) * 0.95)]
    if p95 < 0.0003:
        raise ValueError("TTS audio track is silent")
    gate = p95 * 0.06
    return [round(min(1, max(0, (level - gate) / (p95 - gate))) ** 0.7, 3) for level in raw]


def metadata_cuts(metadata_file, sentences, total_frames):
    if not metadata_file.exists():
        return None
    events = []
    for line in metadata_file.read_text(encoding="utf-8").splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            return None
        if event.get("type") == "SentenceBoundary":
            events.append(event)
    normalize = lambda s: re.sub(r"[\s，,。！？!?；;：:]", "", s).lower()
    if len(events) != len(sentences) or any(
        normalize(e.get("text", "")) != normalize(s)
        for e, s in zip(events, sentences)
    ):
        return None
    cuts = [round(e["offset"] / 10_000_000 * FPS) for e in events[1:]]
    if any(b <= a for a, b in zip([0] + cuts, cuts + [total_frames])):
        return None
    return cuts


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("audio")
    parser.add_argument("timing")
    parser.add_argument("--voice", default=DEFAULT_VOICE, choices=sorted(VOICES))
    parser.add_argument("--rate", type=int, default=0)
    parser.add_argument("--max-chars", type=int, default=360)
    parser.add_argument("--preserve-sentences", action="store_true")
    args = parser.parse_args()
    if not -15 <= args.rate <= 15:
        raise ValueError("语速需在 -15% 到 +15% 之间")
    if not 1 <= args.max_chars <= 1200:
        raise ValueError("文案上限需在 1–1200 字之间")
    text = Path(args.input).read_text(encoding="utf-8").strip()
    if not text or len(text) > args.max_chars:
        raise ValueError(f"B 模式测试文案需为 1–{args.max_chars} 字")
    sentences = split_sentences(text, split_long_clauses=not args.preserve_sentences)
    audio = Path(args.audio)
    audio.parent.mkdir(parents=True, exist_ok=True)
    metadata = Path(args.timing).with_suffix(".boundary.jsonl")
    metadata.unlink(missing_ok=True)
    try:
        if os.environ.get("B_MODE_TTS_ENGINE") == "offline":
            raise RuntimeError("Offline voice selected")
        await edge_tts.Communicate(text, args.voice, rate=f"{args.rate:+d}%", connect_timeout=8, receive_timeout=15).save(str(audio), str(metadata))
        if not audio.exists() or audio.stat().st_size == 0:
            raise RuntimeError("Edge TTS returned an empty audio file")
        voice_engine = "edge-tts"
    except Exception as error:
        if args.voice != DEFAULT_VOICE or args.rate != 0:
            raise RuntimeError(f"所选音色或语速需要在线配音，当前连接失败: {error}") from error
        print(f"Edge TTS failed ({type(error).__name__}: {error}); trying local Chinese voice", file=sys.stderr, flush=True)
        wav = audio.with_suffix(".offline.wav")
        pieces = []
        offline_boundaries = []
        try:
            for index, sentence in enumerate(sentences):
                part_input = audio.with_name(f"offline-{index}.txt")
                part_wav = audio.with_name(f"offline-{index}.wav")
                part_input.write_text(sentence, encoding="utf-8")
                pieces.append((part_input, part_wav))
                subprocess.run(
                    ["powershell.exe", "-NoProfile", "-NonInteractive", "-File",
                     str(Path(__file__).with_name("b-mode-offline-tts.ps1")),
                     "-InputPath", str(part_input), "-OutputPath", str(part_wav)],
                    check=True,
                )
            with wave.open(str(wav), "wb") as joined:
                params = None
                sample_count = 0
                for _, part_wav in pieces:
                    with wave.open(str(part_wav), "rb") as part:
                        if part.getcomptype() != "NONE":
                            raise ValueError("Offline TTS must output PCM")
                        if params is None:
                            params = part.getparams()
                            joined.setparams(params)
                        elif (part.getnchannels(), part.getsampwidth(), part.getframerate()) != (
                                params.nchannels, params.sampwidth, params.framerate):
                            raise ValueError("Offline TTS PCM formats differ")
                        joined.writeframes(part.readframes(part.getnframes()))
                        sample_count += part.getnframes()
                        offline_boundaries.append(round(sample_count / params.framerate * FPS))
            offline_boundaries.pop()  # the final cut is the end of the audio
            subprocess.run(
                ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav),
                 "-codec:a", "libmp3lame", "-q:a", "3", str(audio)], check=True,
            )
            if not audio.exists() or audio.stat().st_size == 0:
                raise RuntimeError("Local voice returned an empty audio file")
        except Exception as fallback_error:
            raise RuntimeError(f"Edge TTS failed: {error}; local voice also failed: {fallback_error}") from fallback_error
        finally:
            wav.unlink(missing_ok=True)
            for part_input, part_wav in pieces:
                part_input.unlink(missing_ok=True)
                part_wav.unlink(missing_ok=True)
        voice_engine = "windows-offline-zh-CN"
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(audio)],
        check=True, capture_output=True, text=True,
    )
    duration_seconds = float(probe.stdout.strip())
    total_frames = max(1, round(duration_seconds * FPS))
    levels = sample_audio_levels(audio, total_frames)
    cuts = metadata_cuts(metadata, sentences, total_frames) if voice_engine == "edge-tts" else offline_boundaries
    segments, timing_method = distribute_frames(sentences, total_frames, levels, cuts)
    if voice_engine != "edge-tts":
        timing_method = "offline_segment_assembly"
    result = {"fps": FPS, "durationSeconds": duration_seconds, "totalFrames": total_frames,
              "voice": args.voice if voice_engine == "edge-tts" else "windows-offline-zh-CN", "rate": args.rate,
              "timingMethod": timing_method, "voiceEngine": voice_engine,
              "waveformSource": "decoded_voiceover_pcm", "audioLevels": levels,
              "segments": segments}
    Path(args.timing).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"B-mode TTS ({voice_engine}, {timing_method}): {duration_seconds:.2f}s, {total_frames} frames, {len(segments)} segments", flush=True)


if __name__ == "__main__":
    asyncio.run(main())


