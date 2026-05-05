
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const API_KEY = process.env.NANOBANANA_API_KEY;
const MODEL_NAME = 'gemini-2.5-flash-image';

if (!API_KEY) {
  console.error('Error: NANOBANANA_API_KEY environment variable is not set.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

async function generateImage(exerciseId: string, promptPath: string) {
  console.log(`Generating image for ${exerciseId}...`);
  const prompt = fs.readFileSync(promptPath, 'utf-8');
  const outPath = path.join('scripts/exercise-images/raw', `${exerciseId}.png`);

  if (fs.existsSync(outPath)) {
    console.log(`  Image already exists at ${outPath}, skipping.`);
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        let imageBase64: string | undefined;

        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
        } else if (part.text && part.text.length > 1000) {
           // Fallback for when it returns as text
           imageBase64 = part.text;
        }

        if (imageBase64) {
          fs.writeFileSync(outPath, Buffer.from(imageBase64, 'base64'));
          console.log(`  Successfully saved to ${outPath}`);
          return;
        }
      }
    }
    console.error(`  Failed to find image data in response for ${exerciseId}`);
  } catch (error) {
    console.error(`  Error generating ${exerciseId}:`, error);
  }
}

async function main() {
  const exercises = process.argv.slice(2);
  if (exercises.length === 0) {
    console.log('Usage: node generate-images-direct.js <exercise-id-1> <exercise-id-2> ...');
    return;
  }

  for (const id of exercises) {
    const promptPath = path.join('scripts/exercise-images/prompts', `${id}.txt`);
    if (!fs.existsSync(promptPath)) {
      console.error(`Prompt file not found: ${promptPath}`);
      continue;
    }
    await generateImage(id, promptPath);
  }
}

main().catch(console.error);
