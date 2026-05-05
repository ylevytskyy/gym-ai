import { GoogleGenAI } from '@google/genai';
const API_KEY = process.env.NANOBANANA_API_KEY;
const ai = new GoogleGenAI({ apiKey: API_KEY });
async function main() {
  const models = await ai.models.list();
  console.log(JSON.stringify(models, null, 2));
}
main().catch(console.error);
