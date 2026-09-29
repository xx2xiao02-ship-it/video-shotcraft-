#!/usr/bin/env npx tsx

/**
 * Generate.ts - Video Generation CLI using Google Veo API
 *
 * Supports Veo 2, Veo 3, and Veo 3.1 models with text-to-video,
 * image-to-video, frame interpolation, video extension, and presets.
 *
 * Usage:
 *   npx tsx Generate.ts --prompt "..." --duration 8 --aspect-ratio 16:9 --output ~/Downloads/video.mp4
 */

import {
  GoogleGenAI,
  type GenerateVideosConfig,
  type GenerateVideosParameters,
  type GenerateVideosOperation,
  type VideoGenerationReferenceImage,
  VideoGenerationReferenceType,
} from "@google/genai";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { extname, resolve, dirname, basename } from "node:path";

// ============================================================================
// Types
// ============================================================================

type AspectRatio = "16:9" | "9:16";
type Resolution = "720p" | "1080p" | "4k";
type Speed = "fast" | "standard";
type ModelFamily = "veo-2" | "veo-3" | "veo-3.1";
type PersonGeneration = "allow_all" | "allow_adult" | "dont_allow";

interface CLIArgs {
  // Required for generation
  prompt?: string;
  output?: string;
  duration?: number;
  aspectRatio?: AspectRatio;

  // Optional generation params
  speed: Speed;
  resolution: Resolution;
  negativePrompt?: string;
  fps: number;
  seed?: number;
  preset?: string;
  referenceImages: string[];
  timeout: number;
  confirmCost: boolean;
  modelFamily: ModelFamily;
  personGeneration?: PersonGeneration;
  count: number;

  // Image-to-video
  image?: string;
  lastFrame?: string;

  // Extension mode
  extend?: string;

  // Query modes
  listPresets: boolean;
  showPreset?: string;
  status?: string;
  dryRun: boolean;
  promptOnly: boolean;
}

interface Preset {
  negativePrompt?: string;
  fps?: number;
  resolution?: Resolution;
  aspectRatio?: AspectRatio;
  promptPrefix?: string;
  promptSuffix?: string;
}

interface OperationMetadata {
  operationId: string;
  videoReference: unknown;
  duration: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  createdAt: string;
}

interface JSONOutput {
  status: "complete" | "dry-run" | "error" | "in-progress";
  [key: string]: unknown;
}

// ============================================================================
// Constants
// ============================================================================

const VALID_ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16"];
const VALID_RESOLUTIONS: Resolution[] = ["720p", "1080p", "4k"];
const VALID_SPEEDS: Speed[] = ["fast", "standard"];
const VALID_MODEL_FAMILIES: ModelFamily[] = ["veo-2", "veo-3", "veo-3.1"];
const VALID_PERSON_GENERATION: PersonGeneration[] = ["allow_all", "allow_adult", "dont_allow"];

const VALID_DURATIONS: Record<ModelFamily, number[]> = {
  "veo-2": [5, 6, 7, 8],
  "veo-3": [4, 6, 8],
  "veo-3.1": [4, 6, 8],
};

const MODEL_IDS: Record<ModelFamily, Record<Speed, string>> = {
  "veo-2": {
    fast: "veo-2.0-generate-001",     // Veo 2 has no fast variant; use standard
    standard: "veo-2.0-generate-001",
  },
  "veo-3": {
    fast: "veo-3.0-fast-generate-preview",
    standard: "veo-3.0-generate-preview",
  },
  "veo-3.1": {
    fast: "veo-3.1-fast-generate-preview",
    standard: "veo-3.1-generate-preview",
  },
};

const COST_PER_SECOND: Record<ModelFamily, Record<Speed, Record<string, number>>> = {
  "veo-2": {
    fast: { default: 0.35 },       // Veo 2 has no fast variant; same price
    standard: { default: 0.35 },
  },
  "veo-3": {
    fast: { default: 0.15 },
    standard: { default: 0.40 },
  },
  "veo-3.1": {
    fast: { default: 0.15, "4k": 0.35 },
    standard: { default: 0.40, "4k": 0.60 },
  },
};

const DEFAULTS = {
  speed: "fast" as Speed,
  resolution: "720p" as Resolution,
  fps: 24,
  timeout: 300000, // 5 minutes
  modelFamily: "veo-3.1" as ModelFamily,
  count: 1,
};

const SKILL_DIR = resolve(dirname(new URL(import.meta.url).pathname), "..");

// ============================================================================
// Helpers
// ============================================================================

function getCostPerSecond(modelFamily: ModelFamily, speed: Speed, resolution: Resolution): number {
  const rates = COST_PER_SECOND[modelFamily][speed];
  return rates[resolution] ?? rates["default"];
}

function getMetaPath(videoPath: string): string {
  const dir = dirname(videoPath);
  const ext = extname(videoPath);
  const base = basename(videoPath, ext);
  return resolve(dir, `${base}.meta.json`);
}

function expandPath(value: string): string {
  return value.startsWith("~") ? value.replace("~", process.env.HOME!) : value;
}

// ============================================================================
// Environment Loading
// ============================================================================

async function loadEnv(): Promise<void> {
  const paiDir = process.env.PAI_DIR || resolve(process.env.HOME!, ".config/pai");
  const envPaths = [
    resolve(paiDir, ".env"),
    resolve(process.env.HOME!, ".claude/.env"),
  ];

  for (const envPath of envPaths) {
    try {
      const envContent = await readFile(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
      break;
    } catch {
      // Continue to next path
    }
  }
}

// ============================================================================
// Error Handling
// ============================================================================

class CLIError extends Error {
  constructor(
    message: string,
    public code: string = "CLI_ERROR",
    public exitCode: number = 1
  ) {
    super(message);
    this.name = "CLIError";
  }
}

function outputJSON(data: JSONOutput): void {
  console.log(JSON.stringify(data, null, 2));
}

function handleError(error: unknown): never {
  if (error instanceof CLIError) {
    outputJSON({
      status: "error",
      code: error.code,
      message: error.message,
    });
    process.exit(error.exitCode);
  }
  if (error instanceof Error) {
    outputJSON({
      status: "error",
      code: "UNEXPECTED_ERROR",
      message: error.message,
    });
    process.exit(1);
  }
  outputJSON({
    status: "error",
    code: "UNKNOWN_ERROR",
    message: String(error),
  });
  process.exit(1);
}

// ============================================================================
// Help
// ============================================================================

function showHelp(): void {
  console.log(`
Generate.ts - Video Generation CLI using Google Veo API

USAGE:
  npx tsx Generate.ts --prompt "<prompt>" --duration <4|6|8> --aspect-ratio <16:9|9:16> --output <path> [OPTIONS]

REQUIRED (for generation):
  --prompt <text>             Video generation prompt (max 1024 tokens)
  --duration <n>              Video duration in seconds (model-dependent, see below)
  --aspect-ratio <ratio>      Aspect ratio: 16:9 or 9:16
  --output <path>             Output file path (.mp4)

MODEL SELECTION:
  --model <family>            Model: veo-2, veo-3, or veo-3.1 (default: veo-3.1)
  --speed <mode>              Speed: fast (default) or standard
                              Note: Veo 2 has no fast variant (always standard pricing)

OPTIONS:
  --resolution <res>          Resolution: 720p (default), 1080p, or 4k (8s only)
                              4k only available on Veo 3 and Veo 3.1
  --negative-prompt <text>    Things to avoid in generation
  --fps <n>                   Frames per second (default: 24)
  --seed <n>                  Seed for reproducibility (0-4294967295)
  --preset <name>             Load preset from Presets.json
  --reference-image <path>    Reference image for subject consistency (up to 3, Veo 3.1 only)
  --person-generation <mode>  Person generation: allow_all, allow_adult, or dont_allow
  --count <n>                 Number of videos to generate (1-4, default: 1)
  --timeout <ms>              Timeout in milliseconds (default: 300000)
  --confirm-cost              Required when using --speed standard or 4k resolution

IMAGE-TO-VIDEO:
  --image <path>              Starting frame image (enables image-to-video mode)
  --last-frame <path>         Ending frame image (enables interpolation mode, requires --image)

VIDEO EXTENSION:
  --extend <path>             Path to video to extend (adds 7 seconds)
                              Requires .meta.json sidecar from original generation
                              Not available with 4k resolution

QUERY OPERATIONS (no generation):
  --list-presets              List available presets as JSON
  --show-preset <name>        Show preset details as JSON
  --status <id>               Check status of operation ID
  --dry-run                   Estimate cost without generating
  --prompt-only               Output final prompt as JSON without generating

DURATION BY MODEL:
  Veo 3.1:  4, 6, or 8 seconds
  Veo 3:    4, 6, or 8 seconds
  Veo 2:    5, 6, 7, or 8 seconds

COST:
  Veo 3.1 fast:      $0.15/s ($1.20 for 8s)  |  4k: $0.35/s ($2.80 for 8s)
  Veo 3.1 standard:  $0.40/s ($3.20 for 8s)  |  4k: $0.60/s ($4.80 for 8s)
  Veo 3 fast:        $0.15/s ($1.20 for 8s)
  Veo 3 standard:    $0.40/s ($3.20 for 8s)
  Veo 2:             $0.35/s ($2.80 for 8s)
  Extension:         7s per extension at model rate

EXAMPLES:
  # Basic generation
  npx tsx Generate.ts --prompt "A cat on a beach" --duration 8 --aspect-ratio 16:9 --output ~/Downloads/cat.mp4

  # 4K generation
  npx tsx Generate.ts --prompt "Cinematic drone shot" --duration 8 --aspect-ratio 16:9 --resolution 4k --confirm-cost --output ~/Downloads/drone.mp4

  # Image-to-video
  npx tsx Generate.ts --image ~/photo.jpg --prompt "The scene comes alive" --duration 8 --aspect-ratio 16:9 --output ~/Downloads/animated.mp4

  # Frame interpolation
  npx tsx Generate.ts --image ~/start.jpg --last-frame ~/end.jpg --prompt "Transition between scenes" --duration 8 --aspect-ratio 16:9 --output ~/Downloads/interp.mp4

  # Generate 4 variations
  npx tsx Generate.ts --prompt "A sunset" --duration 8 --aspect-ratio 16:9 --count 4 --output ~/Downloads/sunset.mp4

  # Using Veo 2
  npx tsx Generate.ts --model veo-2 --prompt "Nature scene" --duration 8 --aspect-ratio 16:9 --output ~/Downloads/nature.mp4

  # Extend existing video
  npx tsx Generate.ts --extend ~/Downloads/base.mp4 --prompt "Continue the scene" --output ~/Downloads/extended.mp4

ENVIRONMENT:
  GOOGLE_API_KEY    Required - set in ~/.claude/.env or $PAI_DIR/.env

MORE INFO:
  Documentation: See SKILL.md
  Prompting:     See references/prompting.md
`);
  process.exit(0);
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(argv: string[]): CLIArgs {
  const args = argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    showHelp();
  }

  const parsed: CLIArgs = {
    speed: DEFAULTS.speed,
    resolution: DEFAULTS.resolution,
    fps: DEFAULTS.fps,
    timeout: DEFAULTS.timeout,
    modelFamily: DEFAULTS.modelFamily,
    count: DEFAULTS.count,
    referenceImages: [],
    confirmCost: false,
    listPresets: false,
    dryRun: false,
    promptOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];

    if (!flag.startsWith("--")) {
      throw new CLIError(`Invalid flag: ${flag}`, "INVALID_FLAG");
    }

    const key = flag.slice(2);

    // Boolean flags
    if (key === "confirm-cost") { parsed.confirmCost = true; continue; }
    if (key === "list-presets") { parsed.listPresets = true; continue; }
    if (key === "dry-run") { parsed.dryRun = true; continue; }
    if (key === "prompt-only") { parsed.promptOnly = true; continue; }

    // Flags with values
    const value = args[i + 1];
    if (!value || value.startsWith("--")) {
      throw new CLIError(`Missing value for: ${flag}`, "MISSING_VALUE");
    }

    switch (key) {
      case "prompt":
        parsed.prompt = value;
        i++;
        break;
      case "output":
        parsed.output = expandPath(value);
        i++;
        break;
      case "duration": {
        const d = parseInt(value, 10);
        // Validation against model-specific durations happens in validateGenerationArgs
        parsed.duration = d;
        i++;
        break;
      }
      case "aspect-ratio":
        if (!VALID_ASPECT_RATIOS.includes(value as AspectRatio)) {
          throw new CLIError(
            `Invalid aspect-ratio: ${value}. Must be 16:9 or 9:16`,
            "INVALID_ASPECT_RATIO"
          );
        }
        parsed.aspectRatio = value as AspectRatio;
        i++;
        break;
      case "speed":
        if (!VALID_SPEEDS.includes(value as Speed)) {
          throw new CLIError(
            `Invalid speed: ${value}. Must be fast or standard`,
            "INVALID_SPEED"
          );
        }
        parsed.speed = value as Speed;
        i++;
        break;
      case "resolution":
        if (!VALID_RESOLUTIONS.includes(value as Resolution)) {
          throw new CLIError(
            `Invalid resolution: ${value}. Must be 720p, 1080p, or 4k`,
            "INVALID_RESOLUTION"
          );
        }
        parsed.resolution = value as Resolution;
        i++;
        break;
      case "model":
        if (!VALID_MODEL_FAMILIES.includes(value as ModelFamily)) {
          throw new CLIError(
            `Invalid model: ${value}. Must be veo-2, veo-3, or veo-3.1`,
            "INVALID_MODEL"
          );
        }
        parsed.modelFamily = value as ModelFamily;
        i++;
        break;
      case "person-generation":
        if (!VALID_PERSON_GENERATION.includes(value as PersonGeneration)) {
          throw new CLIError(
            `Invalid person-generation: ${value}. Must be allow_all, allow_adult, or dont_allow`,
            "INVALID_PERSON_GENERATION"
          );
        }
        parsed.personGeneration = value as PersonGeneration;
        i++;
        break;
      case "count": {
        const count = parseInt(value, 10);
        if (isNaN(count) || count < 1 || count > 4) {
          throw new CLIError(
            `Invalid count: ${value}. Must be 1-4`,
            "INVALID_COUNT"
          );
        }
        parsed.count = count;
        i++;
        break;
      }
      case "negative-prompt":
        parsed.negativePrompt = value;
        i++;
        break;
      case "fps": {
        const fps = parseInt(value, 10);
        if (isNaN(fps) || fps < 1 || fps > 60) {
          throw new CLIError(`Invalid fps: ${value}`, "INVALID_FPS");
        }
        parsed.fps = fps;
        i++;
        break;
      }
      case "seed": {
        const seed = parseInt(value, 10);
        if (isNaN(seed) || seed < 0 || seed > 4294967295) {
          throw new CLIError(
            `Invalid seed: ${value}. Must be 0-4294967295`,
            "INVALID_SEED"
          );
        }
        parsed.seed = seed;
        i++;
        break;
      }
      case "preset":
        parsed.preset = value;
        i++;
        break;
      case "reference-image":
        parsed.referenceImages.push(expandPath(value));
        i++;
        break;
      case "image":
        parsed.image = expandPath(value);
        i++;
        break;
      case "last-frame":
        parsed.lastFrame = expandPath(value);
        i++;
        break;
      case "timeout": {
        const timeout = parseInt(value, 10);
        if (isNaN(timeout) || timeout < 1000) {
          throw new CLIError(`Invalid timeout: ${value}`, "INVALID_TIMEOUT");
        }
        parsed.timeout = timeout;
        i++;
        break;
      }
      case "extend":
        parsed.extend = expandPath(value);
        i++;
        break;
      case "show-preset":
        parsed.showPreset = value;
        i++;
        break;
      case "status":
        parsed.status = value;
        i++;
        break;
      default:
        throw new CLIError(`Unknown flag: ${flag}`, "UNKNOWN_FLAG");
    }
  }

  return parsed;
}

// ============================================================================
// Validation
// ============================================================================

function validateGenerationArgs(args: CLIArgs): void {
  if (!args.prompt) {
    throw new CLIError("Missing required: --prompt", "MISSING_PROMPT");
  }
  if (!args.output) {
    throw new CLIError("Missing required: --output", "MISSING_OUTPUT");
  }
  if (!args.duration) {
    throw new CLIError("Missing required: --duration", "MISSING_DURATION");
  }
  if (!args.aspectRatio) {
    throw new CLIError("Missing required: --aspect-ratio", "MISSING_ASPECT_RATIO");
  }

  // Duration validation per model family
  const validDurations = VALID_DURATIONS[args.modelFamily];
  if (!validDurations.includes(args.duration)) {
    throw new CLIError(
      `Invalid duration: ${args.duration}s for ${args.modelFamily}. Valid: ${validDurations.join(", ")}`,
      "INVALID_DURATION"
    );
  }

  // Resolution validation: 1080p and 4k require duration=8
  if ((args.resolution === "1080p" || args.resolution === "4k") && args.duration !== 8) {
    throw new CLIError(
      `${args.resolution} resolution requires 8-second duration. Got ${args.duration}s.`,
      "INVALID_RESOLUTION"
    );
  }

  // 4k only available on Veo 3 and Veo 3.1
  if (args.resolution === "4k" && args.modelFamily === "veo-2") {
    throw new CLIError(
      "4k resolution is not available on Veo 2. Use Veo 3 or Veo 3.1.",
      "INVALID_RESOLUTION"
    );
  }

  // Veo 2 has no fast variant
  if (args.modelFamily === "veo-2" && args.speed === "fast") {
    process.stderr.write("Note: Veo 2 has no fast variant. Using standard model at standard pricing.\n");
  }

  // Reference images require duration=8 and Veo 3.1
  if (args.referenceImages.length > 0) {
    if (args.modelFamily !== "veo-3.1") {
      throw new CLIError(
        "Reference images are only supported on Veo 3.1.",
        "UNSUPPORTED_FEATURE"
      );
    }
    if (args.duration !== 8) {
      throw new CLIError(
        "Reference images require 8-second duration.",
        "INVALID_DURATION"
      );
    }
  }

  // Image-to-video validation
  if (args.lastFrame && !args.image) {
    throw new CLIError(
      "--last-frame requires --image to be set.",
      "MISSING_IMAGE"
    );
  }

  // Reference image limit
  if (args.referenceImages.length > 3) {
    throw new CLIError(
      `Too many reference images: ${args.referenceImages.length}. Maximum is 3.`,
      "TOO_MANY_REFERENCE_IMAGES"
    );
  }

  // Cost confirmation for standard mode or 4k
  const costPerSec = getCostPerSecond(args.modelFamily, args.speed, args.resolution);
  const totalCost = args.duration * costPerSec * args.count;
  if (!args.confirmCost && (args.speed === "standard" || args.resolution === "4k") && totalCost > 1.50) {
    throw new CLIError(
      `This will cost $${totalCost.toFixed(2)} (${args.count}x ${args.duration}s at $${costPerSec.toFixed(2)}/s). Re-run with --confirm-cost to proceed.`,
      "COST_CONFIRMATION_REQUIRED"
    );
  }
}

function validateExtensionArgs(args: CLIArgs): void {
  if (!args.extend) {
    throw new CLIError("Missing required: --extend", "MISSING_EXTEND");
  }
  if (!args.output) {
    throw new CLIError("Missing required: --output", "MISSING_OUTPUT");
  }
  if (!args.prompt) {
    throw new CLIError("Missing required: --prompt for extension", "MISSING_PROMPT");
  }

  // 4k cannot be extended
  if (args.resolution === "4k") {
    throw new CLIError(
      "4k videos cannot be extended. Extensions output at 720p.",
      "INVALID_RESOLUTION"
    );
  }

  // Cost confirmation for standard mode extensions
  const costPerSec = getCostPerSecond(args.modelFamily, args.speed, "720p");
  if (args.speed === "standard" && !args.confirmCost) {
    const cost = (7 * costPerSec).toFixed(2);
    throw new CLIError(
      `Standard mode costs $${cost} for 7s extension. Re-run with --confirm-cost to proceed.`,
      "COST_CONFIRMATION_REQUIRED"
    );
  }
}

// ============================================================================
// Presets
// ============================================================================

async function loadPresets(): Promise<Record<string, Preset>> {
  const presetsPath = resolve(SKILL_DIR, "scripts", "Presets.json");
  try {
    const content = await readFile(presetsPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function applyPreset(args: CLIArgs): Promise<CLIArgs> {
  if (!args.preset) return args;

  const presets = await loadPresets();
  const preset = presets[args.preset];

  if (!preset) {
    throw new CLIError(
      `Unknown preset: ${args.preset}. Use --list-presets to see available presets.`,
      "UNKNOWN_PRESET"
    );
  }

  // Apply preset defaults (CLI args take precedence)
  const result = { ...args };

  if (preset.fps && args.fps === DEFAULTS.fps) {
    result.fps = preset.fps;
  }
  if (preset.resolution && args.resolution === DEFAULTS.resolution) {
    result.resolution = preset.resolution;
  }
  if (preset.aspectRatio && !args.aspectRatio) {
    result.aspectRatio = preset.aspectRatio;
  }
  if (preset.negativePrompt) {
    result.negativePrompt = args.negativePrompt
      ? `${args.negativePrompt}, ${preset.negativePrompt}`
      : preset.negativePrompt;
  }
  if (preset.promptPrefix || preset.promptSuffix) {
    result.prompt = `${preset.promptPrefix || ""}${args.prompt}${preset.promptSuffix || ""}`;
  }

  return result;
}

// ============================================================================
// Query Operations
// ============================================================================

async function listPresetsCmd(): Promise<void> {
  const presets = await loadPresets();
  const list = Object.entries(presets).map(([name, preset]) => ({
    name,
    aspectRatio: preset.aspectRatio,
    resolution: preset.resolution,
    fps: preset.fps,
    hasPromptModifiers: !!(preset.promptPrefix || preset.promptSuffix),
  }));
  outputJSON({
    status: "complete" as const,
    presets: list,
  });
}

async function showPresetCmd(name: string): Promise<void> {
  const presets = await loadPresets();
  const preset = presets[name];

  if (!preset) {
    throw new CLIError(
      `Unknown preset: ${name}. Use --list-presets to see available presets.`,
      "UNKNOWN_PRESET"
    );
  }

  outputJSON({
    status: "complete" as const,
    name,
    preset,
  });
}

async function checkOperationStatus(ai: GoogleGenAI, operationId: string): Promise<void> {
  try {
    const operationRef = { name: operationId } as GenerateVideosOperation;
    const operation = await ai.operations.getVideosOperation({
      operation: operationRef,
    });

    outputJSON({
      status: operation.done ? "complete" : "in-progress",
      operationId,
      done: operation.done,
      metadata: operation.metadata,
    });
  } catch (error) {
    throw new CLIError(
      `Failed to get operation status: ${error instanceof Error ? error.message : String(error)}`,
      "OPERATION_STATUS_FAILED"
    );
  }
}

// ============================================================================
// Cost Estimation
// ============================================================================

function estimateCost(args: CLIArgs): void {
  const duration = args.extend ? 7 : (args.duration || 8);
  const resolution = args.extend ? "720p" as Resolution : args.resolution;
  const costPerSec = getCostPerSecond(args.modelFamily, args.speed, resolution);
  const totalCost = (duration * costPerSec * args.count).toFixed(2);
  const model = MODEL_IDS[args.modelFamily][args.speed];

  outputJSON({
    status: "dry-run",
    estimatedCost: `$${totalCost}`,
    costPerSecond: `$${costPerSec.toFixed(2)}`,
    duration,
    count: args.count,
    resolution,
    model,
    modelFamily: args.modelFamily,
    speed: args.speed,
    isExtension: !!args.extend,
  });
}

// ============================================================================
// Image Loading
// ============================================================================

async function loadImageAsBase64(imagePath: string): Promise<{ imageBytes: string; mimeType: string }> {
  const imageBuffer = await readFile(imagePath);
  const imageBase64 = imageBuffer.toString("base64");
  const ext = extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  const mimeType = mimeMap[ext];
  if (!mimeType) {
    throw new CLIError(
      `Unsupported image format: ${ext}. Use PNG, JPG, or WebP.`,
      "UNSUPPORTED_IMAGE_FORMAT"
    );
  }
  return { imageBytes: imageBase64, mimeType };
}

async function loadReferenceImages(
  paths: string[]
): Promise<VideoGenerationReferenceImage[]> {
  const images: VideoGenerationReferenceImage[] = [];
  for (const imagePath of paths) {
    const imageData = await loadImageAsBase64(imagePath);
    images.push({
      image: imageData,
      referenceType: VideoGenerationReferenceType.ASSET,
    });
  }
  return images;
}

// ============================================================================
// Operation Metadata
// ============================================================================

async function saveOperationMetadata(
  outputPath: string,
  operationId: string,
  videoReference: unknown,
  duration: number,
  aspectRatio: AspectRatio,
  resolution: Resolution
): Promise<string> {
  const metadata: OperationMetadata = {
    operationId,
    videoReference,
    duration,
    aspectRatio,
    resolution,
    createdAt: new Date().toISOString(),
  };

  const metaPath = getMetaPath(outputPath);
  await writeFile(metaPath, JSON.stringify(metadata, null, 2));
  return metaPath;
}

async function loadOperationMetadata(videoPath: string): Promise<OperationMetadata> {
  const metaPath = getMetaPath(videoPath);

  try {
    const content = await readFile(metaPath, "utf-8");
    return JSON.parse(content);
  } catch {
    throw new CLIError(
      `Cannot extend: ${metaPath} not found. Only videos generated by this tool can be extended.`,
      "EXTENSION_METADATA_MISSING"
    );
  }
}

// ============================================================================
// Polling
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollOperation(
  ai: GoogleGenAI,
  operation: GenerateVideosOperation,
  timeoutMs: number
): Promise<GenerateVideosOperation> {
  const startTime = Date.now();
  let interval = 5000;
  const maxInterval = 30000;
  let currentOp = operation;

  while (!currentOp.done) {
    if (Date.now() - startTime > timeoutMs) {
      throw new CLIError(
        `Timeout after ${Math.round(timeoutMs / 1000)}s`,
        "TIMEOUT"
      );
    }

    await sleep(interval);
    process.stderr.write(".");

    currentOp = await ai.operations.getVideosOperation({
      operation: currentOp,
    });

    interval = Math.min(interval * 1.5, maxInterval);
  }

  process.stderr.write("\n");
  return currentOp;
}

// ============================================================================
// Video Download
// ============================================================================

async function downloadVideo(uri: string, outputPath: string, apiKey: string): Promise<void> {
  process.stderr.write(`Downloading video to ${outputPath}...\n`);

  const downloadUrl = new URL(uri);
  downloadUrl.searchParams.set("key", apiKey);

  const response = await fetch(downloadUrl.toString());
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new CLIError(
      `Failed to download video: ${response.status} ${response.statusText} - ${body}`,
      "DOWNLOAD_FAILED"
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);
}

function getNumberedOutputPath(basePath: string, index: number, total: number): string {
  if (total === 1) return basePath;
  const dir = dirname(basePath);
  const ext = extname(basePath);
  const base = basename(basePath, ext);
  return resolve(dir, `${base}-${index + 1}${ext}`);
}

// ============================================================================
// Video Generation
// ============================================================================

async function generateVideo(ai: GoogleGenAI, args: CLIArgs): Promise<void> {
  const model = MODEL_IDS[args.modelFamily][args.speed];

  process.stderr.write(`Generating ${args.count} video(s) with ${model}...\n`);

  // Build generation config
  const config: GenerateVideosConfig = {
    aspectRatio: args.aspectRatio,
    numberOfVideos: args.count,
    durationSeconds: args.duration,
  };

  if (args.resolution !== "720p") {
    config.resolution = args.resolution;
  }
  if (args.negativePrompt) {
    config.negativePrompt = args.negativePrompt;
  }
  if (args.seed !== undefined) {
    config.seed = args.seed;
  }
  if (args.fps !== DEFAULTS.fps) {
    config.fps = args.fps;
  }
  if (args.personGeneration) {
    config.personGeneration = args.personGeneration;
  }

  // Add reference images to config if provided
  if (args.referenceImages.length > 0) {
    config.referenceImages = await loadReferenceImages(args.referenceImages);
  }

  // Add last frame for interpolation
  if (args.lastFrame) {
    const lastFrameData = await loadImageAsBase64(args.lastFrame);
    config.lastFrame = lastFrameData;
  }

  // Build request
  const request: GenerateVideosParameters = {
    model,
    prompt: args.prompt,
    config,
  };

  // Add starting image for image-to-video
  if (args.image) {
    const imageData = await loadImageAsBase64(args.image);
    request.image = imageData;
  }

  // Start generation
  const operation = await ai.models.generateVideos(request);

  // Poll for completion
  const completedOperation = await pollOperation(ai, operation, args.timeout);

  // Extract videos
  const response = completedOperation.response as {
    generatedVideos?: Array<{ video?: { uri?: string } }>;
  };

  if (!response?.generatedVideos || response.generatedVideos.length === 0) {
    throw new CLIError("No video returned from API", "NO_VIDEO_RETURNED");
  }

  const costPerSec = getCostPerSecond(args.modelFamily, args.speed, args.resolution);
  const perVideoCost = args.duration! * costPerSec;
  const totalCost = perVideoCost * response.generatedVideos.length;
  const results: Array<{ outputPath: string; metadataPath: string }> = [];

  for (let i = 0; i < response.generatedVideos.length; i++) {
    const generated = response.generatedVideos[i];
    if (!generated?.video?.uri) {
      process.stderr.write(`Warning: Video ${i + 1} has no URI, skipping.\n`);
      continue;
    }

    const outputPath = getNumberedOutputPath(args.output!, i, response.generatedVideos.length);

    await downloadVideo(generated.video.uri, outputPath, process.env.GOOGLE_API_KEY!);

    const metaPath = await saveOperationMetadata(
      outputPath,
      completedOperation.name!,
      generated.video,
      args.duration!,
      args.aspectRatio!,
      args.resolution
    );

    results.push({ outputPath, metadataPath: metaPath });
  }

  outputJSON({
    status: "complete",
    videos: results,
    count: results.length,
    operationId: completedOperation.name,
    duration: args.duration,
    resolution: args.resolution,
    cost: `$${totalCost.toFixed(2)}`,
    model,
    modelFamily: args.modelFamily,
    extendable: args.resolution !== "4k",
  });
}

// ============================================================================
// Video Extension
// ============================================================================

async function extendVideo(ai: GoogleGenAI, args: CLIArgs): Promise<void> {
  const metadata = await loadOperationMetadata(args.extend!);

  const model = MODEL_IDS[args.modelFamily][args.speed];

  process.stderr.write(`Extending video with ${model}...\n`);

  const request: GenerateVideosParameters = {
    model,
    prompt: args.prompt,
    video: metadata.videoReference as { uri?: string },
    config: {
      aspectRatio: metadata.aspectRatio,
      numberOfVideos: 1,
    },
  };

  const operation = await ai.models.generateVideos(request);
  const completedOperation = await pollOperation(ai, operation, args.timeout);

  const response = completedOperation.response as {
    generatedVideos?: Array<{ video?: { uri?: string } }>;
  };

  if (
    !response?.generatedVideos ||
    response.generatedVideos.length === 0 ||
    !response.generatedVideos[0]?.video?.uri
  ) {
    throw new CLIError("No video returned from API", "NO_VIDEO_RETURNED");
  }

  const videoUri = response.generatedVideos[0].video.uri;
  const videoReference = response.generatedVideos[0].video;

  await downloadVideo(videoUri, args.output!, process.env.GOOGLE_API_KEY!);

  const extensionDuration = 7;
  const totalDuration = metadata.duration + extensionDuration;

  const metaPath = await saveOperationMetadata(
    args.output!,
    completedOperation.name!,
    videoReference,
    totalDuration,
    metadata.aspectRatio,
    "720p"
  );

  const costPerSec = getCostPerSecond(args.modelFamily, args.speed, "720p");
  const cost = (extensionDuration * costPerSec).toFixed(2);

  outputJSON({
    status: "complete",
    videos: [{ outputPath: args.output, metadataPath: metaPath }],
    operationId: completedOperation.name,
    extendedFrom: args.extend,
    extensionDuration,
    totalDuration,
    resolution: "720p",
    cost: `$${cost}`,
    model,
    modelFamily: args.modelFamily,
    extendable: totalDuration < 148,
  });
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  try {
    await loadEnv();
    let args = parseArgs(process.argv);

    // Handle query operations first (no API key needed for presets)
    if (args.listPresets) {
      await listPresetsCmd();
      return;
    }

    if (args.showPreset) {
      await showPresetCmd(args.showPreset);
      return;
    }

    // Handle dry run (no API key needed)
    if (args.dryRun) {
      if (!args.duration && !args.extend) {
        throw new CLIError("--dry-run requires --duration or --extend", "MISSING_DURATION");
      }
      estimateCost(args);
      return;
    }

    // Apply preset if specified
    args = await applyPreset(args);

    // Handle prompt-only mode (no API key needed)
    if (args.promptOnly) {
      if (!args.prompt) {
        throw new CLIError("--prompt-only requires --prompt", "MISSING_PROMPT");
      }
      outputJSON({
        status: "complete" as const,
        mode: "prompt-only",
        prompt: args.prompt,
        negativePrompt: args.negativePrompt || null,
        preset: args.preset || null,
        referenceImages: args.referenceImages.length > 0 ? args.referenceImages : null,
        image: args.image || null,
        lastFrame: args.lastFrame || null,
        parameters: {
          duration: args.duration || null,
          aspectRatio: args.aspectRatio || null,
          resolution: args.resolution,
          fps: args.fps,
          speed: args.speed,
          modelFamily: args.modelFamily,
          personGeneration: args.personGeneration || null,
          count: args.count,
        },
      });
      return;
    }

    // Validate args before requiring API key (fail fast with useful errors)
    if (args.extend) {
      validateExtensionArgs(args);
    } else if (!args.status) {
      validateGenerationArgs(args);
    }

    // API operations require key
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new CLIError(
        "Missing GOOGLE_API_KEY. Set in ~/.claude/.env or $PAI_DIR/.env",
        "MISSING_API_KEY"
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Handle status check
    if (args.status) {
      await checkOperationStatus(ai, args.status);
      return;
    }

    // Handle extension mode
    if (args.extend) {
      await extendVideo(ai, args);
      return;
    }

    // Handle normal generation
    await generateVideo(ai, args);
  } catch (error) {
    handleError(error);
  }
}

main();
