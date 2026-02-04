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
  brandName: document.getElementById('brandName'),
  descLabel: document.getElementById('descLabel'),
  instrLabel: document.getElementById('instrLabel'),
  // overlay
  overlay: document.getElementById('variantOverlay'),
  grid: document.getElementById('variantGrid'),
  close: document.getElementById('variantClose'),
  cancel: document.getElementById('variantCancel'),
  variantTitle: document.getElementById('variantTitle'),
  // header buttons
  backspaceBtn: document.getElementById('backspaceBtn'),
  clearBtn: document.getElementById('clearBtn'),
  numpadClear: document.getElementById('numpadClear'),
  // numpad root
  numpad: document.getElementById('numpad'),
  numpadBackspace: document.querySelector('.action-backspace'),
  langButtons: document.querySelectorAll('.lang-btn'),
  langSwitch: document.querySelector('.lang-switch'),
};

const cardViewEl = document.querySelector('.card-view');
const cardMediaEl = document.querySelector('.card-media');
const cardTextEl  = document.querySelector('.card-text');
const paperEl     = document.querySelector('.paper');

/* ======= stan wpisywania ======= */
let buffer = '';            // aktualnie wpisywane cyfry (0–3)
let twoDigitTimer = null;   // timer auto-commit po 2 cyfrach
let lastCommitted = null;   // ostatnio zatwierdzony numer "000"
let lastShownRecord = null;
let currentVariants = null;
let lastErrorKey = null;

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
  lastErrorKey = null;
}

const i18n = {
  pl: {
    ui: {
      brand: 'Karty',
      title: 'Karty 000–499 — Viewer',
      clear: 'Czyść',
      backspaceAria: 'Usuń ostatnią cyfrę',
      clearAria: 'Wyczyść',
      numpadAria: 'Klawiatura numeryczna',
      numpadClearAria: 'Wyczyść',
      backspaceAriaShort: 'Usuń',
      desc: 'Opis',
      instr: 'Instrukcja',
      variantTitle: 'Wybierz kartę',
      variantCloseAria: 'Zamknij',
      variantGridAria: 'Warianty karty',
      variantCancel: 'Anuluj',
      langGroup: 'Język',
    },
    errors: {
      invalidRange: 'Nieprawidłowy numer (0–499).',
      outOfRange: 'Numer spoza zakresu (000–499).',
      notFound: 'Brak karty dla tego numeru.',
      csvLoad: 'Nie udało się wczytać danych (CSV). Sprawdź ścieżkę i nazwę pliku.',
    },
    fallbackTitle: n => `Karta ${pad3(n)}`,
    fallbackVariant: idx => `Wariant ${idx + 1}`,
  },
  it: {
    ui: {
      brand: 'Carte',
      title: 'Carte 000–499 — Viewer',
      clear: 'Pulisci',
      backspaceAria: 'Cancella ultima cifra',
      clearAria: 'Pulisci',
      numpadAria: 'Tastierino numerico',
      numpadClearAria: 'Pulisci',
      backspaceAriaShort: 'Cancella',
      desc: 'Descrizione',
      instr: 'Istruzioni',
      variantTitle: 'Seleziona carta',
      variantCloseAria: 'Chiudi',
      variantGridAria: 'Varianti della carta',
      variantCancel: 'Annulla',
      langGroup: 'Lingua',
    },
    errors: {
      invalidRange: 'Numero non valido (0–499).',
      outOfRange: 'Numero fuori intervallo (000–499).',
      notFound: 'Nessuna carta per questo numero.',
      csvLoad: 'Impossibile caricare i dati (CSV). Controlla percorso e nome del file.',
    },
    fallbackTitle: n => `Carta ${pad3(n)}`,
    fallbackVariant: idx => `Variante ${idx + 1}`,
  },
  ru: {
    ui: {
      brand: 'Карты',
      title: 'Карты 000–499 — Viewer',
      clear: 'Очистить',
      backspaceAria: 'Удалить последнюю цифру',
      clearAria: 'Очистить',
      numpadAria: 'Цифровая клавиатура',
      numpadClearAria: 'Очистить',
      backspaceAriaShort: 'Удалить',
      desc: 'Описание',
      instr: 'Инструкция',
      variantTitle: 'Выберите карту',
      variantCloseAria: 'Закрыть',
      variantGridAria: 'Варианты карты',
      variantCancel: 'Отмена',
      langGroup: 'Язык',
    },
    errors: {
      invalidRange: 'Неверный номер (0–499).',
      outOfRange: 'Номер вне диапазона (000–499).',
      notFound: 'Карта с таким номером не найдена.',
      csvLoad: 'Не удалось загрузить данные (CSV). Проверь путь и имя файла.',
    },
    fallbackTitle: n => `Карта ${pad3(n)}`,
    fallbackVariant: idx => `Вариант ${idx + 1}`,
  },
};

let currentLang = 'pl';

function getLang() {
  const saved = window.localStorage.getItem('lang');
  return i18n[saved] ? saved : 'pl';
}

function setLanguage(lang) {
  if (!i18n[lang]) return;
  currentLang = lang;
  window.localStorage.setItem('lang', lang);

  const t = i18n[lang];
  document.documentElement.lang = lang;
  document.title = t.ui.title;

  if (els.brandName) els.brandName.textContent = t.ui.brand;
  if (els.clearBtn) {
    els.clearBtn.textContent = t.ui.clear;
    els.clearBtn.setAttribute('aria-label', t.ui.clearAria);
  }
  if (els.numpadClear) {
    els.numpadClear.textContent = t.ui.clear;
    els.numpadClear.setAttribute('aria-label', t.ui.numpadClearAria);
  }
  if (els.backspaceBtn) els.backspaceBtn.setAttribute('aria-label', t.ui.backspaceAria);
  if (els.numpadBackspace) els.numpadBackspace.setAttribute('aria-label', t.ui.backspaceAriaShort);
  if (els.numpad) els.numpad.setAttribute('aria-label', t.ui.numpadAria);
  if (els.descLabel) els.descLabel.textContent = t.ui.desc;
  if (els.instrLabel) els.instrLabel.textContent = t.ui.instr;
  if (els.variantTitle) els.variantTitle.textContent = t.ui.variantTitle;
  if (els.cancel) els.cancel.textContent = t.ui.variantCancel;
  if (els.close) els.close.setAttribute('aria-label', t.ui.variantCloseAria);
  if (els.grid) els.grid.setAttribute('aria-label', t.ui.variantGridAria);
  if (els.langSwitch) els.langSwitch.setAttribute('aria-label', t.ui.langGroup);

  els.langButtons?.forEach(btn => {
    const isActive = btn.getAttribute('data-lang') === lang;
    btn.classList.toggle('is-active', isActive);
  });

  const hasError = !els.error.hidden;
  if (hasError && lastErrorKey) {
    showError(i18n[currentLang].errors[lastErrorKey] || '');
  } else if (lastShownRecord) {
    fillCardUI(lastShownRecord);
  }
  if (currentVariants) openVariants(currentVariants);
}

function getCardTitle(rec) {
  if (currentLang === 'ru') {
    return (rec.card_name_ru || rec.card_name_pl || rec.card_name_it || rec.card_name || '').trim() || i18n.ru.fallbackTitle(rec.number);
  }
  if (currentLang === 'it') {
    return (rec.card_name_it || rec.card_name_pl || rec.card_name || '').trim() || i18n.it.fallbackTitle(rec.number);
  }
  return (rec.card_name_pl || rec.card_name || '').trim() || i18n.pl.fallbackTitle(rec.number);
}

function getCardDesc(rec) {
  if (currentLang === 'ru') {
    return (rec.description_ru || rec.description_pl || rec.description_it || rec.description || '—').trim();
  }
  if (currentLang === 'it') {
    return (rec.description_it || rec.description_pl || rec.description || '—').trim();
  }
  return (rec.description_pl || rec.description || '—').trim();
}

function getCardInstr(rec) {
  if (currentLang === 'ru') {
    return (rec.instruction_ru || rec.instruction_pl || rec.instruction_it || rec.instruction || '—').trim();
  }
  if (currentLang === 'it') {
    return (rec.instruction_it || rec.instruction_pl || rec.instruction || '—').trim();
  }
  return (rec.instruction_pl || rec.instruction || '—').trim();
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
    card_name_it: norm['card_name_it'] ?? norm['card name_it'] ?? '',
    description_it: norm['description_it'] ?? '',
    instruction_it: norm['instruction_it'] ?? '',
    card_name_ru: norm['card_name_ru'] ?? norm['card name_ru'] ?? '',
    description_ru: norm['description_ru'] ?? '',
    instruction_ru: norm['instruction_ru'] ?? '',
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
  const title = getCardTitle(rec);
  els.title.textContent = title;
  els.descPL.textContent = getCardDesc(rec);
  els.instrPL.textContent = getCardInstr(rec);
  els.img.src = rec.imageUrl || '';
  lastShownRecord = rec;

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
  currentVariants = variants;
  els.grid.innerHTML = '';
  variants.forEach((v, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'variant-item';
    const thumb = document.createElement('img');
    thumb.src = v.imageUrl || '';
    thumb.alt = getCardTitle(v) || i18n[currentLang].fallbackVariant(idx);
    const cap = document.createElement('div');
    cap.className = 'variant-caption';
    cap.textContent = getCardTitle(v) || i18n[currentLang].fallbackVariant(idx);
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
  currentVariants = null;
}

/* ======= logika wyszukiwania ======= */
function resolveAndShow() {
  const n = Number(buffer.replace(/^0+/, '') || '0');
  if (!Number.isInteger(n) || n < 0 || n > 499) {
    lastErrorKey = 'invalidRange';
    showError(i18n[currentLang].errors[lastErrorKey]);
    return;
  }
  const variants = cardsMap.get(n) || [];
  if (variants.length === 0) {
    lastErrorKey = 'notFound';
    showError(i18n[currentLang].errors[lastErrorKey]);
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
    if (buffer.length === 3) {
      lastErrorKey = 'outOfRange';
      showError(i18n[currentLang].errors[lastErrorKey]);
    }
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

  // przełącznik języka
  els.langButtons?.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const lang = btn.getAttribute('data-lang');
      if (lang) setLanguage(lang);
    });
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
  // Reorder: mobile ⇄ desktop
  if (cardViewEl && cardMediaEl && cardTextEl) {
    if (isMobileWidth()) {
      if (cardTextEl.nextElementSibling !== cardMediaEl) {
        cardViewEl.insertBefore(cardTextEl, cardMediaEl);
      }
    } else {
      if (cardMediaEl.nextElementSibling !== cardTextEl) {
        cardViewEl.insertBefore(cardMediaEl, cardTextEl);
      }
    }
  }

  const vv = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const topH = document.querySelector('.topbar')?.offsetHeight ?? 0;
  const numH = els.numpad?.offsetHeight ?? 0;

  // kluczowa zmiana ↓↓↓
  const extra = 6;   // BYŁO 16 — zmniejszamy bufor (to DA najwięcej przestrzeni!)

  if (isMobileWidth() && paperEl) {
    // gdzie zaczyna się kartka?
    const paperRect = paperEl.getBoundingClientRect();

    // "linia" nad klawiaturą
    const safeBottom = vv - numH - extra;

    // ile miejsca na kartkę?
    let avail = safeBottom - paperRect.top;

    // minimalna wysokość kartki
    avail = Math.max(100, avail);

    // ustawiamy dynamiczną wysokość kartki
    paperEl.style.maxHeight = `${avail}px`;
    paperEl.style.overflow = 'auto';
    paperEl.style.webkitOverflowScrolling = 'touch';
    paperEl.style.paddingRight = '8px';

    // DUŻA ZMIANA: obrazek może być teraz większy
    if (els.img) {
      // im więcej miejsca, tym większy obraz
      const maxImg = 260; // było 200–220
      const minImg = 90;

      const freeSpace = paperRect.top - topH - 4;   // od topbar do kartki
      const imgH = Math.max(minImg, Math.min(maxImg, freeSpace * 0.85));

      els.img.style.maxHeight = `${imgH}px`;
      els.img.style.objectFit = 'contain';
      els.img.style.width = '100%';
      els.img.style.height = 'auto';
    }

    // miniaturka w tytule (zależnie od przestrzeni)
        // miniaturka w tytule (zależnie od przestrzeni, ale ogólnie większa)
    const maxThumb = 9.8;   // było 3.0
    const minThumb = 11.2;   // było 1.6
    const ratio = Math.max(0, Math.min(1, avail / 260));
    const thumbSize = minThumb + (maxThumb - minThumb) * ratio;
    document.documentElement.style.setProperty('--card-thumb-size', `${thumbSize}em`);

    return;
  }

  // DESKTOP – bez zmian
  const extraDesk = 12;
  const availDesk = Math.max(140, vv - topH - numH - extraDesk);

  if (paperEl) {
    paperEl.style.maxHeight = `${availDesk}px`;
  }

  if (els.img) {
    els.img.style.maxHeight = `${availDesk}px`;
  }

  document.documentElement.style.removeProperty('--card-thumb-size');
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
  renderBuffer();
  setLanguage(getLang());

  // 1) najpierw CSV (osobny try/catch tylko do tego)
  try {
    await loadCSV();
  } catch (err) {
    console.error(err);
    lastErrorKey = 'csvLoad';
    showError(i18n[currentLang].errors[lastErrorKey]);
    return; // bez danych nie idziemy dalej
  }

  // 2) UI i layout
  try {
    bindUI();
    bindViewportHandlers();
    fitLayoutHeights();
  } catch (err) {
    console.error('[init/layout error]', err);
    // tutaj świadomie NIE pokazujemy błędu "CSV"
  }
})();
