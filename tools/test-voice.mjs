import { readFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const envContent = readFileSync('.env.local', 'utf-8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const val = trimmed.slice(eqIdx + 1);
  if (!process.env[key]) process.env[key] = val;
}

const srcFile = readFileSync('src/server/anthropic.ts', 'utf-8');
const promptMatch = srcFile.match(/export const VOICE_SYSTEM_PROMPT = `([\s\S]*?)`;/);
if (!promptMatch) { console.error('Could not extract VOICE_SYSTEM_PROMPT'); process.exit(1); }
const VOICE_SYSTEM_PROMPT = promptMatch[1];

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const customInputs = [
  'got ghosted',
  'Sunday scaries',
  'my landlord raised rent',
  'lost my keys again',
  'third coffee today',
];

async function generate(prompt) {
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL_GEN ?? 'claude-sonnet-4-6',
    max_tokens: 200,
    temperature: 0.9,
    system: [{ type: 'text', text: VOICE_SYSTEM_PROMPT }],
    messages: [{ role: 'user', content: prompt }],
  });
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return JSON.parse(text);
}

console.log('=== CUSTOM INPUT VOICE TEST (5 inputs, not in curated pool) ===\n');

for (const input of customInputs) {
  console.log(`--- "${input}" ---`);
  try {
    const result = await generate(input);
    console.log(`  Line 1 (${result.line1.length}c): ${result.line1}`);
    console.log(`  Line 2 (${result.line2.length}c): ${result.line2}`);
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }
  console.log('');
}
