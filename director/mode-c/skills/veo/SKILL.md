---
name: veo
description: "This skill should be used when the user asks to generate a video, create a video clip, make a video from a prompt, animate an image, extend an existing video, or work with Google Veo. Supports Veo 2, Veo 3, and Veo 3.1 models. Trigger phrases: generate a video, create a video, make a clip, animate this image, extend this video, video of, /veo."
argument-hint: "[prompt] [--duration 4|6|8] [--aspect-ratio 16:9|9:16] [--preset name]"
---

# Video Generation with Google Veo

Generate high-quality videos using Google's Veo API (Veo 2, 3, 3.1) with text-to-video, image-to-video, frame interpolation, presets, cost controls, and video extension.

## Tool Location

The generation CLI is at: `${SKILL_DIR}/scripts/Generate.ts`

Run with: `npx tsx "${SKILL_DIR}/scripts/Generate.ts" [OPTIONS]`

## Prerequisites

- **Node.js 18+** installed
- **GOOGLE_API_KEY** set in `~/.claude/.env`

## Interactive Flow

### 1. Parse Arguments

Check what the user provided via `$ARGUMENTS`:
- Prompt text
- `--duration` (model-dependent: Veo 3.1/3: 4,6,8; Veo 2: 5,6,7,8)
- `--aspect-ratio` (16:9 or 9:16)
- `--model` (veo-2, veo-3, veo-3.1; default: veo-3.1)
- `--preset` (cinematic, vertical-social, product-demo, documentary)
- `--output` (file path for the .mp4)
- `--image` (starting frame for image-to-video)
- `--last-frame` (ending frame for interpolation, requires --image)

### 2. Gather Missing Information

If **prompt** is missing, ask:
> What video would you like to generate? Describe the scene, subject, and action.

If **duration** is missing, ask with options (for Veo 3.1):
- 4 seconds ($0.60 fast / $1.60 standard)
- 6 seconds ($0.90 fast / $2.40 standard)
- 8 seconds ($1.20 fast / $3.20 standard) — Recommended

If **aspect-ratio** is missing, ask with options:
- 16:9 (YouTube, presentations) — Recommended
- 9:16 (TikTok, Reels, Stories)

### 3. Optional Enhancements

Optionally ask about:
- **Model**: veo-3.1 (default), veo-3, or veo-2
- **Preset**: cinematic, vertical-social, product-demo, documentary, or none
- **Resolution**: 720p (default), 1080p (8s only), or 4k (8s only, Veo 3+ only)
- **Speed**: fast (default) or standard (higher quality)
- **Count**: 1-4 videos to generate at once
- **Person generation**: allow_all, allow_adult, or dont_allow

### 4. Output Path

If output is missing, generate a default:
```
~/Downloads/video-[timestamp].mp4
```

When `--count` > 1, outputs are numbered: `video-1.mp4`, `video-2.mp4`, etc.

### 5. Cost Estimation

Before generating, run a dry-run to show cost:
```bash
npx tsx "${SKILL_DIR}/scripts/Generate.ts" \
  --prompt "..." --duration X --aspect-ratio X:X --dry-run
```

Show the estimated cost and confirm with the user before proceeding.

### 6. Generate

Run the generation:
```bash
npx tsx "${SKILL_DIR}/scripts/Generate.ts" \
  --prompt "USER_PROMPT" \
  --duration DURATION \
  --aspect-ratio ASPECT_RATIO \
  [--model MODEL] \
  [--preset PRESET] \
  [--resolution RESOLUTION] \
  [--speed SPEED] \
  [--count COUNT] \
  [--image IMAGE_PATH] \
  [--last-frame LAST_FRAME_PATH] \
  [--person-generation MODE] \
  [--confirm-cost] \
  --output OUTPUT_PATH
```

### 7. Report Results

After completion, report:
- Output file path(s) and count
- Actual cost
- Whether the video can be extended (not available for 4k)
- Metadata file path (needed for extensions)

## Image-to-Video

Animate a starting image:
```bash
npx tsx "${SKILL_DIR}/scripts/Generate.ts" \
  --image /path/to/photo.jpg \
  --prompt "The scene comes alive..." \
  --duration 8 --aspect-ratio 16:9 \
  --output /path/to/animated.mp4
```

## Frame Interpolation

Generate a video that transitions between two keyframes:
```bash
npx tsx "${SKILL_DIR}/scripts/Generate.ts" \
  --image /path/to/start.jpg \
  --last-frame /path/to/end.jpg \
  --prompt "Smooth transition between scenes" \
  --duration 8 --aspect-ratio 16:9 \
  --output /path/to/interpolated.mp4
```

Interpolation requires duration=8 and is only supported on Veo 3.1.

## Video Extension

To extend a previously generated video:
```bash
npx tsx "${SKILL_DIR}/scripts/Generate.ts" \
  --extend /path/to/previous.mp4 \
  --prompt "Continue the scene as..." \
  --output /path/to/extended.mp4
```

Extensions add 7 seconds per call. Requires the `.meta.json` sidecar from the original generation. Maximum total duration: 148 seconds. Not available for 4k videos.

## Models

| Model | Durations | Fast Variant | 4k | Extension | Reference Images |
|-------|-----------|-------------|-----|-----------|-----------------|
| Veo 3.1 | 4, 6, 8s | Yes | Yes | Yes | Yes (up to 3) |
| Veo 3 | 4, 6, 8s | Yes | Yes | No | No |
| Veo 2 | 5, 6, 7, 8s | No | No | No | No |

## Presets

| Preset | Style | Default Aspect |
|--------|-------|----------------|
| cinematic | Film-quality, 24fps, shallow DOF | Any |
| vertical-social | Punchy social media, 30fps | 9:16 |
| product-demo | Clean studio lighting | Any |
| documentary | Nature documentary style | Any |

## Cost Reference

| Model | Speed | Cost/Second | 8s Clip |
|-------|-------|-------------|---------|
| Veo 3.1 | Fast | $0.15 | $1.20 |
| Veo 3.1 | Standard | $0.40 | $3.20 |
| Veo 3.1 4k | Fast | $0.35 | $2.80 |
| Veo 3.1 4k | Standard | $0.60 | $4.80 |
| Veo 3 | Fast | $0.15 | $1.20 |
| Veo 3 | Standard | $0.40 | $3.20 |
| Veo 2 | Standard | $0.35 | $2.80 |

`--confirm-cost` required when using standard speed or 4k resolution.

## Prompting Tips

Refer to `references/prompting.md` for the full guide. Key points:
- Use the 6-part formula: Cinematography, Subject, Action, Context, Style, Audio
- Audio is generated natively from prompt cues (dialogue in quotes, sound effects, ambient noise)
- Front-load critical information (early tokens are weighted more)
- One camera movement and one action per clip
- 100-150 words is the sweet spot
- Use `--negative-prompt` to exclude unwanted elements

## Query Operations

```bash
# List available presets
npx tsx "${SKILL_DIR}/scripts/Generate.ts" --list-presets

# Show preset details
npx tsx "${SKILL_DIR}/scripts/Generate.ts" --show-preset cinematic

# Preview final prompt with preset applied
npx tsx "${SKILL_DIR}/scripts/Generate.ts" --prompt "..." --preset cinematic --prompt-only

# Cost estimate
npx tsx "${SKILL_DIR}/scripts/Generate.ts" --prompt "test" --duration 8 --aspect-ratio 16:9 --dry-run

# Check operation status
npx tsx "${SKILL_DIR}/scripts/Generate.ts" --status OPERATION_ID
```
