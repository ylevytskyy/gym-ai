# Gemini Project Instructions: Exercise Image Generation

This document outlines the workflow and style requirements for generating exercise images using the **Nano Banana** extension.

## Tools & Pipeline

The project uses a multi-step pipeline to generate consistent, high-quality exercise instruction images.

1.  **Prompt Generation:**
    `scripts/generate-image-prompts.ts`
    Reads `exercises.json`, `layouts.json`, and `pose-details.json` to generate detailed image generation prompts in `scripts/exercise-images/prompts/{exercise-id}.txt`.

2.  **Image Generation (Nano Banana):**
    Use the `nanobanana` extension to generate a single grid image for each exercise.
    The prompt in the `.txt` file contains all necessary style and layout instructions.
    Generated images should be saved to `scripts/exercise-images/raw/{exercise-id}.png`.

3.  **Image Splitting:**
    `scripts/split-exercise-images.py`
    Splits the raw grid images into individual step panels, resizes them, and saves them to `assets/images/exercises/{exercise-id}/step-{n}.png`.
    This script also updates `assets/data/exercise-images.json` and generates `src/lib/exerciseImageMap.ts`.

## Nanobanana Setup

### API Key Configuration
The `nanobanana` extension requires a Gemini API key. Configure it using:

```bash
gemini extensions config nanobanana NANOBANANA_API_KEY <your_key>
```

Alternatively, add it to your `.env` file (the extension will pick it up):
```env
NANOBANANA_API_KEY=AIzaSy...
```

### Style Requirements
All exercise images must follow these strict style guidelines (encoded in the prompt generator):
- **Art Style:** Illustrated cartoon, clean vector-like look, bold outlines, flat colors.
- **Character:** Gender-neutral abstract human, same character across all panels.
- **Background:** White / transparent.
- **Grid:** Tightly packed panels with 2px gray dividers.
- **No Text:** No labels, numbers, or captions in the image.

## Commands

| Task | Command |
|---|---|
| Generate Prompts | `pnpm tsx scripts/generate-image-prompts.ts` |
| Split Raw Images | `python3 scripts/split-exercise-images.py` |
| Sync All Data | `pnpm sync-data` |

## Troubleshooting

- **"Not connected" error:** Ensure the `NANOBANANA_API_KEY` is set. If the error persists, try restarting your Gemini CLI session or killing any lingering `nanobanana` processes (`pkill -f nanobanana`).
- **Node Version:** Ensure you are using a recent version of Node (v20+). On this machine, prefer the Homebrew Node at `/opt/homebrew/Cellar/node/25.7.0/bin/node`.
