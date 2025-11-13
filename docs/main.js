// main.js — statyczny frontend (CSV z docs/data) + autouzupełnianie 2/3 cyfry
// + mobile keyboard safe (tekst zawsze widoczny), + reorder image<->text na mobile

const els = {
  display: document.getElementById('display'),
  error: document.getElementById('error'),
  result: document.getElementById('result'),
  img: document.getElementById('cardImage'),
  title: document.getElementById('cardTitle'),
  descPL: document.getElementById('descPL'),
  instrPL: document.getElementById('instrPL'),
  // overlay
  overlay: document.getElementById('variantOverlay'),
  grid: document.getElementById('variantGrid'),
  close: document.getElementById('variantClose'),
  cancel: document.getElementById('variantCancel'),
  // header buttons
  backspaceBtn: document.getElementById('backspaceBtn'),
  clearBtn: document.getElementById('clearBtn'),
  // numpad root
  numpad: document.getElementById('numpad'),
};

const cardViewEl = document.querySelector('.card-view');
const cardMediaEl = document.querySelector('.card-media');
const cardTextEl  = document.querySelector('.card-text');
const paperEl     = document.querySelector('.paper');

/* ======= stan wpisywania ======= */
let buffer = '';            // aktualnie wpisywane cyfry (0–3)
let twoDigitTimer = null;   // timer auto-commit po 2 cyfrach
let lastCommitted = null;   // ostatnio zatwierdzony numer "000"

let cardsMap = new Map();   // number -> [warianty]

/* ======= helpers ======= */
const pad3 = n => String(n).padStart(3, '0');

function showError(msg = '') {
  els.error.textContent = msg;
  els.error.hidden = !msg;
  if (msg) els.result.hidden = true;
}
function clearError() {
  els.error.hidden = true;
  els.error.textContent = '';
}

function renderBuffer() {
  if (buffer.length > 0) {
    // pokaż wpisywany numer + podkreślenia
    els.display.textContent = (buffer + '___').slice(0, 3).replace(/\s/g, '_');
    return;
  }
  if (lastCommitted) {
    els.display.textContent = lastCommitted;
    return;
  }
  els.display.textContent = '___';
}

function stopTwoDigitTimer() {
  if (twoDigitTimer) {
    clearTimeout(twoDigitTimer);
    twoDigitTimer = null;
  }
}

function setCommitted(n3) {
  lastCommitted = n3;
  buffer = '';
  stopTwoDigitTimer();
  renderBuffer();
}

function doClearAll() {
  buffer = '';
  lastCommitted = null;
  stopTwoDigitTimer();
  renderBuffer();
  clearError();
  els.result.hidden = true;
  closeVariants();
}

function doBackspace() {
  stopTwoDigitTimer();
  if (buffer.length > 0) {
    buffer = buffer.slice(0, -1);
  } else if (lastCommitted) {
    // backspace na pustym buforze czyści ostatnio zatwierdzony numer
    lastCommitted = null;
  }
  renderBuffer();
}

function normalizeFilename(f) {
  if (!f) return '';
  return String(f).replace(/^\.\//, '').trim();
}

/* ======= CSV ======= */
function recordFromRow(row) {
  const norm = {};
  for (const k in row) norm[k.toLowerCase().trim()] = (row[k] ?? '').toString();

  const n = Number(String(norm['number']).trim().replace(/^0+/, '') || '0');
  if (!Number.isInteger(n) || n < 0 || n > 499) return null;

  const filename = normalizeFilename(norm['filename']);
  const imageName = filename ? filename.split('/').pop() : '';

  return {
    number: n,
    filename,
    imageUrl: imageName ? `cards/${imageName}` : '',
    card_name: norm['card name'] ?? norm['card_name'] ?? '',
    card_name_pl: norm['card name_pl'] ?? norm['card_name_pl'] ?? '',
    type: norm['type'] ?? '',
    description: norm['description'] ?? '',
    instruction: norm['instruction'] ?? '',
    description_pl: norm['description_pl'] ?? '',
    instruction_pl: norm['instruction_pl'] ?? '',
    raw_text: norm['text'] ?? ''
  };
}

async function loadCSV() {
  const url = 'data/LandsOfGalzyr_cards.csv';
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`CSV ${res.status} ${url}`);
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

  const map = new Map();
  for (const row of parsed.data) {
    const rec = recordFromRow(row);
    if (!rec) continue;
    const arr = map.get(rec.number) ?? [];
    arr.push(rec);
    map.set(rec.number, arr);
  }
  cardsMap = map;
  console.log('[cards-viewer] CSV OK, unikalne numery:', cardsMap.size);
}

/* ======= UI render ======= */
function fillCardUI(rec) {
  const title = (rec.card_name_pl || rec.card_name || '').trim() || `Karta ${pad3(rec.number)}`;
  els.title.textContent = title;
  els.descPL.textContent = (rec.description_pl || rec.description || '—').trim();
  els.instrPL.textContent = (rec.instruction_pl || rec.instruction || '—').trim();
  els.img.src = rec.imageUrl || '';
  // ustaw miniaturę obok tytułu (tylko mobile CSS to użyje)
if (rec.imageUrl) {
  document.documentElement.style.setProperty('--card-thumb', `url(${rec.imageUrl})`);
}

  els.img.alt = `${pad3(rec.number)} — ${title}`;
  els.result.hidden = false;
  clearError();

  // po wyświetleniu karty dopasuj layout do aktualnego viewportu (np. po wysunięciu klawy)
  fitLayoutHeights();
}

/* ======= overlay ======= */
function openVariants(variants) {
  els.grid.innerHTML = '';
  variants.forEach((v, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'variant-item';
    const thumb = document.createElement('img');
    thumb.src = v.imageUrl || '';
    thumb.alt = (v.card_name_pl || v.card_name || `Wariant ${idx + 1}`).trim();
    const cap = document.createElement('div');
    cap.className = 'variant-caption';
    cap.textContent = (v.card_name_pl || v.card_name || '').trim() || `Wariant ${idx + 1}`;
    btn.appendChild(thumb);
    btn.appendChild(cap);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeVariants();
      fillCardUI(v);
      setCommitted(pad3(v.number));
    });
    els.grid.appendChild(btn);
  });
  els.overlay.classList.remove('hidden');
  els.overlay.setAttribute('aria-hidden', 'false');
}
function closeVariants() {
  els.overlay.classList.add('hidden');
  els.overlay.setAttribute('aria-hidden', 'true');
}

/* ======= logika wyszukiwania ======= */
function resolveAndShow() {
  const n = Number(buffer.replace(/^0+/, '') || '0');
  if (!Number.isInteger(n) || n < 0 || n > 499) {
    showError('Nieprawidłowy numer (0–499).');
    return;
  }
  const variants = cardsMap.get(n) || [];
  if (variants.length === 0) {
    showError('Brak karty dla tego numeru.');
    return;
  }
  if (variants.length === 1) {
    closeVariants();
    fillCardUI(variants[0]);
    setCommitted(pad3(n));
  } else {
    openVariants(variants);
    // zatwierdzenie (setCommitted) nastąpi po wyborze wariantu
  }
}

function pushDigit(d) {
  // jeżeli była zatwierdzona karta i zaczynamy nowy wpis — zgaś ją z wyświetlacza
  if (!buffer && lastCommitted) lastCommitted = null;

  if (buffer.length >= 3) buffer = '';
  buffer += d;
  renderBuffer();

  const n = Number(buffer);
  if (!Number.isInteger(n) || n < 0 || n > 499) {
    if (buffer.length === 3) showError('Numer spoza zakresu (000–499).');
    return;
  }

  // 3 cyfry => natychmiast
  if (buffer.length === 3) {
    stopTwoDigitTimer();
    resolveAndShow();
    return;
  }

  // 2 cyfry => auto-commit po 1.5 s
  if (buffer.length === 2) {
    stopTwoDigitTimer();
    twoDigitTimer = setTimeout(() => {
      if (buffer.length === 2) {
        resolveAndShow(); // pokaż to, co wpisane (np. "38" => "038")
      }
      twoDigitTimer = null;
    }, 1500);
  }
}

/* ======= bindowanie ======= */
function bindUI() {
  // numpad (ekran)
  document.querySelectorAll('.btn.num[data-digit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const d = btn.getAttribute('data-digit');
      if (d) pushDigit(d);
    });
  });

  // numpad backspace
  document.querySelectorAll('.btn.red.action-backspace').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); doBackspace(); });
  });

  // numpad clear
  document.querySelectorAll('.btn.red.action-clear').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); doClearAll(); });
  });

  // topbar backspace/clear
  els.backspaceBtn?.addEventListener('click', (e) => { e.preventDefault(); doBackspace(); });
  els.clearBtn?.addEventListener('click', (e) => { e.preventDefault(); doClearAll(); });

  // overlay close/cancel
  els.close?.addEventListener('click', (e) => { e.preventDefault(); closeVariants(); });
  els.cancel?.addEventListener('click', (e) => { e.preventDefault(); closeVariants(); });

  // klawiatura fizyczna
  window.addEventListener('keydown', (e) => {
    if (e.key >= '0' && e.key <= '9') {
      pushDigit(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      doBackspace();
    } else if (e.key === 'Escape') {
      doClearAll();
    } else if (e.key === 'Enter') {
      if (buffer.length > 0) {
        stopTwoDigitTimer();
        resolveAndShow();
      }
    }
  });
}

/* ======= MOBILE LAYOUT: keyboard-safe wysokości + reorder ======= */
function isMobileWidth() {
  return window.innerWidth <= 768;
}

/**
 * Ustaw maksymalne wysokości dla tekstu i miniatury tak,
 * by nigdy nie chowały się pod klawiaturą (używa visualViewport).
 * Dodatkowo przy szerokości ≤768px układa tekst NAD obrazem.
 */
function fitLayoutHeights() {
  // Reorder: najpierw ustaw kolejność DOM na mobile/desktop
  if (cardViewEl && cardMediaEl && cardTextEl) {
    if (isMobileWidth()) {
      // tekst nad obrazkiem (reference image niżej)
      if (cardTextEl.nextElementSibling !== cardMediaEl) {
        cardViewEl.insertBefore(cardTextEl, cardMediaEl);
      }
    } else {
      // obraz po lewej, tekst po prawej — przywróć oryginalną kolejność
      if (cardMediaEl.nextElementSibling !== cardTextEl) {
        cardViewEl.insertBefore(cardMediaEl, cardTextEl);
      }
    }
    // tekst
  if (paperEl) {
    paperEl.style.maxHeight = `${avail}px`;
    paperEl.style.overflow = 'auto';
    paperEl.style.webkitOverflowScrolling = 'touch';
    paperEl.style.paddingRight = '8px';
  }

  // obrazek
  if (els.img) {
    if (isMobileWidth()) {
      const cap = Math.min(Math.max(100, Math.round(vv * 0.28)), 220);
      els.img.style.maxHeight = `${cap}px`;   // na mobile trzymamy małą miniaturę
    } else {
      // na desktopie NIE ustawiamy maxHeight w px — robi to CSS (100% ramki)
      els.img.style.maxHeight = '';           // <— wyczyść ewentualną wartość z mobile
    }
    els.img.style.objectFit = 'contain';
    els.img.style.width = 'auto';  // bo ramka ogranicza szerokość
    els.img.style.height = 'auto';
  }
  }

  // policz realną wysokość widocznego obszaru
  const vv = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const topbar = document.querySelector('.topbar');
  const topH = topbar ? topbar.offsetHeight : 0;
  const numH = els.numpad ? els.numpad.offsetHeight : 0;

  // trochę zapasu na odstępy/safe-area
  const extra = 16;
  const avail = Math.max(140, vv - topH - numH - extra);

  // Tekst (paper) ma mieć max-height = avail (żeby cały był czytelny)
  if (paperEl) {
    paperEl.style.maxHeight = `${avail}px`;
    paperEl.style.overflow = 'auto';
    paperEl.style.webkitOverflowScrolling = 'touch';
    paperEl.style.paddingRight = '8px';
  }

  // Obrazek: na mobile ograniczamy do ~28% widocznego viewportu i do 220px
  if (els.img) {
    if (isMobileWidth()) {
      const cap = Math.min(Math.max(100, Math.round(vv * 0.28)), 220);
      els.img.style.maxHeight = `${cap}px`;
    } else {
      // na większych ekranach obrazek może rosnąć, ale nie przekraczać avail
      els.img.style.maxHeight = `${avail}px`;
    }
    els.img.style.objectFit = 'contain';
    els.img.style.width = '100%';
    els.img.style.height = 'auto';
  }
}

// reaguj na zmiany wysokości/rotacji/pojawienia się klawiatury
function bindViewportHandlers() {
  window.addEventListener('resize', fitLayoutHeights);
  window.addEventListener('orientationchange', fitLayoutHeights);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitLayoutHeights);
  }
}

/* ======= init ======= */
(async function init() {
  try {
    renderBuffer();
    await loadCSV();
    bindUI();
    bindViewportHandlers();
    fitLayoutHeights(); // pierwsze dopasowanie
  } catch (err) {
    console.error(err);
    showError('Nie udało się wczytać danych (CSV). Sprawdź ścieżkę i nazwę pliku.');
  }
})();
