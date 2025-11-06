import express from 'express';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;
const CARDS_CSV = process.env.CARDS_CSV || path.join(__dirname, 'data', 'cards.csv');
const CARDS_DIR = process.env.CARDS_DIR || path.join(__dirname, 'public', 'cards');

const app = express();
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ===== Pamięć: number -> [cards]
let cardsByNumber = new Map();

function normalizeFilename(f) {
  if (!f) return '';
  return f.replace(/^\.\//, '').trim();
}

function toRecord(row) {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), typeof v === 'string' ? v : (v ?? '')])
  );

  const numRaw = normalized['number'];
  const n = Number(String(numRaw).trim());
  if (!Number.isInteger(n) || n < 0 || n > 499) return null;

  const filename = normalizeFilename(normalized['filename']);
  const imageName = path.basename(filename || '');

  return {
    number: n,
    filename,
    imageUrl: imageName ? `/cards/${imageName}` : '',
    card_name: normalized['card name'] ?? normalized['card_name'] ?? '',
    card_name_pl: normalized['card name_pl'] ?? normalized['card_name_pl'] ?? '',
    type: normalized['type'] ?? '',
    description: normalized['description'] ?? '',
    instruction: normalized['instruction'] ?? '',
    description_pl: normalized['description_pl'] ?? '',
    instruction_pl: normalized['instruction_pl'] ?? '',
    raw_text: normalized['text'] ?? ''
  };
}

function loadCSV() {
  if (!fs.existsSync(CARDS_CSV)) {
    console.warn(`[WARN] Brak pliku CSV: ${CARDS_CSV}`);
    cardsByNumber = new Map();
    return;
  }
  const raw = fs.readFileSync(CARDS_CSV, 'utf8');
  const records = parse(raw, { columns: true, skip_empty_lines: true });

  const map = new Map();
  for (const row of records) {
    const rec = toRecord(row);
    if (!rec) continue;
    const list = map.get(rec.number) ?? [];
    list.push(rec);
    map.set(rec.number, list);
  }
  cardsByNumber = map;
  console.log(`[INFO] Załadowano kart (unikalne numery): ${cardsByNumber.size}`);
}

loadCSV();

// ===== Health
app.get('/api/health', (_req, res) => {
  // policz łączną liczbę wariantów
  let total = 0;
  for (const [, arr] of cardsByNumber) total += arr.length;
  res.json({ ok: true, numbers: cardsByNumber.size, total });
});

// ===== Reload (opcjonalnie)
app.post('/api/reload', (_req, res) => {
  loadCSV();
  let total = 0;
  for (const [, arr] of cardsByNumber) total += arr.length;
  res.json({ ok: true, numbers: cardsByNumber.size, total });
});

// ===== Wszystkie warianty dla numeru
app.get('/api/cards/:number', (req, res) => {
  const raw = String(req.params.number || '').trim();
  const n = Number(raw.replace(/^0+/, '') || '0');
  if (!Number.isInteger(n) || n < 0 || n > 499) {
    return res.status(400).json({ error: 'Invalid number' });
  }
  const variants = cardsByNumber.get(n) || [];
  if (variants.length === 0) return res.status(404).json({ error: 'No cards for number' });
  res.json(variants);
});

// ===== Pojedyncza karta: /api/card/:number?filename=...
app.get('/api/card/:number', (req, res) => {
  const raw = String(req.params.number || '').trim();
  const n = Number(raw.replace(/^0+/, '') || '0');
  if (!Number.isInteger(n) || n < 0 || n > 499) {
    return res.status(400).json({ error: 'Invalid number' });
  }
  const variants = cardsByNumber.get(n) || [];
  if (variants.length === 0) return res.status(404).json({ error: 'Card not found' });

  const { filename } = req.query;
  if (filename) {
    const base = path.basename(String(filename));
    const found = variants.find(v => path.basename(v.filename) === base || path.basename(v.imageUrl) === base);
    if (!found) return res.status(404).json({ error: 'Card not found for filename' });
    return res.json(found);
  }

  // jeśli tylko jeden wariant — zwróć, jeśli więcej — zwróć pierwszy (frontend i tak użyje /api/cards do wyboru)
  return res.json(variants[0]);
});

// ===== Serwuj katalog z obrazkami (public/cards)
if (!fs.existsSync(CARDS_DIR)) {
  console.warn(`[WARN] Katalog kart nie istnieje: ${CARDS_DIR}`);
}
app.use('/cards', express.static(CARDS_DIR));

app.listen(PORT, () => {
  console.log(`▶ Server running on http://localhost:${PORT}`);
});
