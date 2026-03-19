#!/usr/bin/env node
// translate-to-german.js
// Reads the CSV, translates EN card content to German, writes DE columns back.
//
// Usage:
//   npm install @anthropic-ai/sdk csv-stringify   (one-time)
//   ANTHROPIC_API_KEY=sk-... node translate-to-german.js
//
// The script translates only cards that do not yet have a card_name_de value,
// so it is safe to re-run after partial runs.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, 'docs', 'data', 'LandsOfGalzyr_cards.csv');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── helpers ──────────────────────────────────────────────────────────────────

function norm(row, ...keys) {
  for (const k of keys) {
    const v = row[k] ?? row[k.replace('_', ' ')] ?? '';
    if (v.trim()) return v.trim();
  }
  return '';
}

async function translateCard(cardName, description, instruction) {
  const prompt = `You are a professional board game translator. Translate the following Lands of Galzyr card from English into German.

Keep the game's epic, atmospheric fantasy style:
- Card names should feel evocative and thematic
- Descriptions use a literary, second-person narrative voice (as in the original)
- Instructions are precise, clear, and use game terminology in German (e.g. AIM, GRD, GK), abbreviate symbols with the same symbols as in English)
- Preserve any special symbols or abbreviations (H, ©, @, &, AIM, GRD, GK, GER, etc.) as-is
- Do not add or remove mechanical content

Return ONLY a JSON object with three fields: card_name, description, instruction.
No markdown, no extra text.

Card name: ${cardName}
Description: ${description}
Instruction: ${instruction}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].text.trim();
  // Strip possible markdown code fences
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(clean);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });

  // Collect unique card numbers that need translation
  // Key: card number, value: { name, description, instruction } from EN
  const toTranslate = new Map();
  for (const row of rows) {
    const numStr = (row['number'] ?? '').toString().trim();
    const n = Number(numStr.replace(/^0+/, '') || '0');
    if (!Number.isInteger(n) || n < 0 || n > 499) continue;

    // Skip if DE already populated
    const existingDe = (row['card_name_de'] ?? '').trim();
    if (existingDe) continue;

    if (!toTranslate.has(n)) {
      const cardName = norm(row, 'card name', 'card_name');
      const description = norm(row, 'description');
      const instruction = norm(row, 'instruction');
      if (cardName || description || instruction) {
        toTranslate.set(n, { cardName, description, instruction });
      }
    }
  }

  const total = toTranslate.size;
  console.log(`Cards to translate: ${total}`);
  if (total === 0) {
    console.log('Nothing to do — all cards already have German translations.');
    return;
  }

  // Translate with rate limiting (sequential to avoid API overload)
  const translations = new Map(); // number -> { card_name, description, instruction }
  let done = 0;
  for (const [n, { cardName, description, instruction }] of toTranslate) {
    process.stdout.write(`[${done + 1}/${total}] Translating card ${String(n).padStart(3, '0')} "${cardName}"... `);
    try {
      const de = await translateCard(cardName, description, instruction);
      translations.set(n, de);
      console.log('✓');
    } catch (err) {
      console.log(`✗ (${err.message}) — skipping`);
    }
    done++;
    // Small pause to be polite to the API
    await new Promise(r => setTimeout(r, 300));
  }

  // Write translations back into all rows with matching number
  for (const row of rows) {
    const numStr = (row['number'] ?? '').toString().trim();
    const n = Number(numStr.replace(/^0+/, '') || '0');
    const de = translations.get(n);
    if (de) {
      row['card_name_de']   = de.card_name   ?? '';
      row['description_de'] = de.description ?? '';
      row['instruction_de'] = de.instruction ?? '';
    }
  }

  // Collect all column names (preserve original order, then add DE if missing)
  const firstRow = rows[0] ?? {};
  const columns = Object.keys(firstRow);
  if (!columns.includes('card_name_de'))   columns.splice(columns.indexOf('instruction_ru') + 1, 0, 'card_name_de');
  if (!columns.includes('description_de')) columns.splice(columns.indexOf('card_name_de') + 1, 0, 'description_de');
  if (!columns.includes('instruction_de')) columns.splice(columns.indexOf('description_de') + 1, 0, 'instruction_de');

  const out = stringify(rows, { header: true, columns });
  fs.writeFileSync(CSV_PATH, out, 'utf8');
  console.log(`\nDone! Wrote ${translations.size} translated cards to:\n  ${CSV_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
