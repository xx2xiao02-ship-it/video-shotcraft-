# Veo Video Generation Skill for Claude Code

Generate high-quality AI videos directly from Claude Code using Google's Veo API. Supports text-to-video, image-to-video, frame interpolation, video extension, and built-in presets.

## Supported Models

- **Veo 3.1** — Latest model with 4k, extensions, and reference images
- **Veo 3** — High quality with 4k support
- **Veo 2** — Standard quality

## Installation

### 1. Copy the skill into your project

Copy the `veo` folder into your project's `.claude/skills/` directory:

```
your-project/
└── .claude/
    └── skills/
        └── veo/
            ├── SKILL.md
            ├── package.json
            ├── scripts/
            │   ├── Generate.ts
            │   └── Presets.json
            └── references/
                └── prompting.md
```

If you don't have a `.claude/skills/` directory yet, create it:

```bash
mkdir -p .claude/skills
```

Then copy the skill:

```bash
cp -r /path/to/veo .claude/skills/veo
```

### 2. Install dependencies

```bash
cd .claude/skills/veo
npm install
```

This installs:
- `@google/genai` — Google Generative AI SDK
- `tsx` — TypeScript execution engine

### 3. Set up your Google API key

Get an API key from [Google AI Studio](https://aistudio.google.com/apikey), then add it to `~/.claude/.env`:

```bash
echo "GOOGLE_API_KEY=your-api-key-here" >> ~/.claude/.env
```

> **Important:** The value must be the API key string itself (starts with `AIza...`), not a path to a JSON file.

### 4. Verify

Open Claude Code in your project and type:

```
/veo a test prompt
```

Claude will walk you through duration, aspect ratio, and cost confirmation before generating.

## Usage

### Basic text-to-video

```
/veo A golden retriever running through a sunlit meadow, cinematic slow motion
```

### With options

```
/veo A coffee cup on a marble table with steam rising --duration 8 --aspect-ratio 16:9 --preset cinematic
```

### Image-to-video

```
/veo Animate this photo with gentle movement --image /path/to/photo.jpg --duration 8
```

### Frame interpolation

```
/veo Smooth transition between these two frames --image /path/to/start.jpg --last-frame /path/to/end.jpg --duration 8
```

### Extend a video

```
/veo Continue the scene with a slow pan right --extend /path/to/previous.mp4
```

### Natural language (no slash command)

You can also just describe what you want:

```
Generate a video of ocean waves crashing on rocks at sunset
```

Claude will recognize the intent and use the skill automatically.

## Options Reference

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `--duration` | 4, 6, 8 (Veo 3.1/3) · 5, 6, 7, 8 (Veo 2) | Prompted | Clip length in seconds |
| `--aspect-ratio` | `16:9`, `9:16` | Prompted | Output aspect ratio |
| `--model` | `veo-3.1`, `veo-3`, `veo-2` | `veo-3.1` | Model to use |
| `--preset` | `cinematic`, `vertical-social`, `product-demo`, `documentary` | None | Prompt style preset |
| `--resolution` | `720p`, `1080p`, `4k` | `720p` | Output resolution (1080p/4k require 8s) |
| `--speed` | `fast`, `standard` | `fast` | Generation quality (standard costs more) |
| `--count` | 1–4 | 1 | Number of variations to generate |
| `--output` | File path | `~/Downloads/video-[timestamp].mp4` | Output file location |
| `--image` | File path | — | Starting frame for image-to-video |
| `--last-frame` | File path | — | Ending frame for interpolation (requires `--image`) |
| `--extend` | File path | — | Video to extend (requires `.meta.json` sidecar) |
| `--person-generation` | `allow_all`, `allow_adult`, `dont_allow` | — | Person generation policy |
| `--negative-prompt` | Text | — | Elements to exclude |
| `--dry-run` | — | — | Show cost estimate without generating |
| `--confirm-cost` | — | — | Required for standard speed or 4k |

## Cost Reference

| Model | Speed | Cost/Second | 4s Clip | 8s Clip |
|-------|-------|-------------|---------|---------|
| Veo 3.1 | Fast | $0.15 | $0.60 | $1.20 |
| Veo 3.1 | Standard | $0.40 | $1.60 | $3.20 |
| Veo 3.1 4k | Fast | $0.35 | $1.40 | $2.80 |
| Veo 3.1 4k | Standard | $0.60 | $2.40 | $4.80 |
| Veo 3 | Fast | $0.15 | $0.60 | $1.20 |
| Veo 3 | Standard | $0.40 | $1.60 | $3.20 |
| Veo 2 | Standard | $0.35 | $1.40 | $2.80 |

Claude always shows a cost estimate and asks for confirmation before generating.

## Presets

| Preset | Style |
|--------|-------|
| `cinematic` | Film-quality, 24fps, shallow depth of field |
| `vertical-social` | Punchy social media, 30fps, defaults to 9:16 |
| `product-demo` | Clean studio lighting |
| `documentary` | Nature documentary style |

## Prompting Tips

- **6-part formula:** Cinematography + Subject + Action + Context + Style + Audio
- **Front-load** the most important details (early tokens carry more weight)
- **One camera movement** and **one action** per clip
- **100–150 words** is the sweet spot
- **Audio cues** are generated natively — include dialogue in quotes, describe sound effects and ambient noise
- See `references/prompting.md` for the full prompting guide

## Troubleshooting

### "API key not valid" / "API keys are not supported"
Make sure `~/.claude/.env` contains your actual API key string (starts with `AIza...`), not a path to a JSON credentials file:
```
# Correct
GOOGLE_API_KEY=AIzaSyB...

# Wrong — this is a file path, not a key
GOOGLE_API_KEY=my-service-account.json
```
Get your key from [Google AI Studio](https://aistudio.google.com/apikey).

### Dependencies not found
Run `npm install` inside the skill directory:
```bash
cd .claude/skills/veo && npm install
```

### Node.js version
Requires Node.js 18 or later. Check with `node --version`.

## File Structure

```
veo/
├── SKILL.md              # Skill definition (triggers, description, instructions)
├── README.md             # This file
├── package.json          # Dependencies (@google/genai, tsx)
├── scripts/
│   ├── Generate.ts       # Main generation CLI
│   └── Presets.json      # Preset configurations
└── references/
    └── prompting.md      # Detailed prompting guide
```

## License

MIT
