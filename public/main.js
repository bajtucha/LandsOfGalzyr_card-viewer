// Elementy
const displayEl = document.getElementById('display');
const resultEl = document.getElementById('result');
const errorEl = document.getElementById('error');
const cardImage = document.getElementById('cardImage');
const cardTitle = document.getElementById('cardTitle');
const descPL = document.getElementById('descPL');
const instrPL = document.getElementById('instrPL');
const clearBtn = document.getElementById('clearBtn');
const backspaceBtn = document.getElementById('backspaceBtn');

// Overlay multi-wyboru
const overlayEl = document.getElementById('variantOverlay');
const gridEl = document.getElementById('variantGrid');
const closeEl = document.getElementById('variantClose');
const cancelEl = document.getElementById('variantCancel');
const titleEl = document.getElementById('variantTitle');

// Numpad
const numpadEl = document.getElementById('numpad');

// ===== Stan wpisywania =====
let buffer = '';               // aktualnie wpisywane cyfry (0–3)
let twoDigitTimer = null;      // timer auto-commit po 2 cyfrach
let lastCommitted = null;      // ostatnio zatwierdzony numer w formacie "000"

// ===== Helpers
const pad3 = (n) => n.toString().padStart(3, '0');

function renderBuffer() {
  // Jeśli coś wpisujemy – pokazujemy bufor + podkreślenia
  if (buffer.length > 0) {
    displayEl.textContent = (buffer + '___').slice(0, 3).replace(/\s/g, '_');
    return;
  }
  // Jeśli nic nie wpisujemy, ale mamy zatwierdzony numer – pokaż go
  if (lastCommitted) {
    displayEl.textContent = lastCommitted;
    return;
  }
  // Domyślnie pusto
  displayEl.textContent = '___';
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  resultEl.hidden = true;
}
function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function stopTwoDigitTimer() {
  if (twoDigitTimer) {
    clearTimeout(twoDigitTimer);
    twoDigitTimer = null;
  }
}

function resetBuffer(hard = false) {
  buffer = '';
  stopTwoDigitTimer();
  if (hard) {
    lastCommitted = null; // pełny reset wyświetlacza
    resultEl.hidden = true;
    clearError();
  }
  renderBuffer();
}

function setCommitted(n3) {
  lastCommitted = n3;
  buffer = '';
  stopTwoDigitTimer();
  renderBuffer();
}

function fillCardUIFromData(data) {
  // Tytuł: preferuj PL, fallback EN
  const titlePL = (data.card_name_pl || '').trim();
  const titleEN = (data.card_name || '').trim();
  const title = titlePL || titleEN || '';

  // Opisy: preferuj PL, fallback EN
  const plDesc = (data.description_pl || '').trim();
  const plInstr = (data.instruction_pl || '').trim();
  const enDesc = (data.description || '').trim();
  const enInstr = (data.instruction || '').trim();

  cardImage.src = data.imageUrl || '';
  cardImage.alt = `${pad3(data.number)} — ${title || 'Card'}`;
  cardTitle.textContent = `${pad3(data.number)} · ${title}`.trim();

  descPL.textContent  = plDesc  || enDesc || '—';
  instrPL.textContent = plInstr || enInstr || '—';

  resultEl.hidden = false;
}

// ===== API
async function fetchVariants(n3) {
  const res = await fetch(`/api/cards/${n3}`);
  if (!res.ok) return null;
  return await res.json(); // array
}

async function fetchCard(n3, filename) {
  const url = filename
    ? `/api/card/${n3}?filename=${encodeURIComponent(filename)}`
    : `/api/card/${n3}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

// ===== Multi-wybór kafelków
function pickTitle(card) {
  const pl = (card.card_name_pl || '').trim();
  if (pl) return pl;
  const en = (card.card_name || '').trim();
  if (en) return en;
  return '—';
}

function tileTemplate(card) {
  const n3 = pad3(card.number);
  const name = pickTitle(card);
  const type = (card.type || '').trim();
  const img  = (card.imageUrl || card.filename || '').trim();

  return `
    <div class="variant-tile" role="option" tabindex="0" data-number="${n3}" data-filename="${img ? img.split('/').pop() : ''}">
      <span class="variant-badge">${n3}</span>
      <div class="variant-thumb">
        ${img ? `<img src="${img}" alt="${name}" loading="lazy">` : `<div style="width:60%;height:60%;background:#ddd;border-radius:8px;"></div>`}
      </div>
      <div class="variant-meta">
        <div class="variant-name" title="${name}">${name}</div>
        ${ type ? `<div class="variant-type" title="${type}">${type}</div>` : '' }
      </div>
    </div>
  `;
}

function renderVariantGrid(variants, n3label = '') {
  gridEl.innerHTML = variants.map(tileTemplate).join('');
  titleEl.textContent = n3label ? `Wybierz kartę ${n3label}` : 'Wybierz kartę';

  gridEl.querySelectorAll('.variant-tile').forEach(tile => {
    const choose = async () => {
      const n3 = tile.getAttribute('data-number');
      const filename = tile.getAttribute('data-filename') || '';
      const data = await fetchCard(n3, filename || undefined);
      if (!data) return showError('Nie znaleziono karty lub błąd wczytywania.');

      // Uzupełnij UI i ustaw zatwierdzony numer w wyświetlaczu (np. 038)
      fillCardUIFromData(data);
      setCommitted(n3);
      closeVariantPicker();
    };
    tile.addEventListener('click', choose);
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
    });
  });
}

function openVariantPicker(n3, variants) {
  renderVariantGrid(variants, n3);
  overlayEl.classList.remove('hidden');
  overlayEl.setAttribute('aria-hidden', 'false');
  const first = gridEl.querySelector('.variant-tile');
  if (first) first.focus();
}

function closeVariantPicker() {
  overlayEl.classList.add('hidden');
  overlayEl.setAttribute('aria-hidden', 'true');
  gridEl.innerHTML = '';
}
closeEl?.addEventListener('click', closeVariantPicker);
cancelEl?.addEventListener('click', closeVariantPicker);
overlayEl?.addEventListener('click', (e) => { if (e.target === overlayEl) closeVariantPicker(); });

// ===== Ładowanie po numerze (obsługa multi/single)
async function loadByNumber(n3) {
  clearError();
  const variants = await fetchVariants(n3);
  if (!variants) { showError('Nie znaleziono kart dla tego numeru.'); return; }

  if (variants.length === 1) {
    // Single: od razu uzupełnij kartę i ustaw display na padded
    fillCardUIFromData(variants[0]);
    setCommitted(n3);
  } else {
    // Multi: otwórz overlay; committed ustawimy po wyborze wariantu
    openVariantPicker(n3, variants);
  }
}

// ===== Obsługa wpisywania
function pushDigit(d) {
  // Jeśli poprzednio był zatwierdzony numer, a zaczynamy nowy wpis – wyczyść go z wyświetlacza
  if (!buffer && lastCommitted) {
    lastCommitted = null;
  }

  if (buffer.length >= 3) buffer = '';
  buffer += d;
  renderBuffer();

  const n = Number(buffer);
  if (!Number.isInteger(n) || n < 0 || n > 499) {
    if (buffer.length === 3) showError('Numer spoza zakresu (000–499).');
    return;
  }

  // 3 cyfry -> natychmiastowe ładowanie
  if (buffer.length === 3) {
    stopTwoDigitTimer();
    loadByNumber(pad3(n));
    return;
  }

  // 2 cyfry -> auto-commit po chwili
  if (buffer.length === 2) {
    stopTwoDigitTimer();
    twoDigitTimer = setTimeout(() => {
      // w trakcie zwłoki bufor mógł się zmienić — sprawdź w locie
      if (buffer.length === 2) {
        const nNow = Number(buffer);
        if (Number.isInteger(nNow) && nNow >= 0 && nNow <= 99) {
          loadByNumber(pad3(nNow)); // setCommitted zrobi się w loadByNumber / wyborze
        }
        twoDigitTimer = null;
      }
    }, 1500);
  }
}

// Klawiatura fizyczna
window.addEventListener('keydown', (e) => {
  if (e.key === 'Backspace') {
    stopTwoDigitTimer();
    if (buffer.length > 0) {
      buffer = buffer.slice(0, -1);
    } else if (lastCommitted) {
      // Backspace na pustym buforze – usuń ostatnio zatwierdzony numer
      lastCommitted = null;
    }
    renderBuffer();
    e.preventDefault();
    return;
  }
  if (e.key === 'Escape') {
    resetBuffer(true); // pełny reset
    return;
  }
  const isDigit = /^[0-9]$/.test(e.key);
  const isNumpad = e.code && /^Numpad[0-9]$/.test(e.code);
  if (isDigit || isNumpad) {
    const d = e.key.replace('Numpad', '');
    pushDigit(d);
  }
});

// Numpad (ekranowy)
if (numpadEl) {
  numpadEl.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;

    if (t.dataset.digit) {
      pushDigit(t.dataset.digit);
      return;
    }
    if (t.dataset.action === 'clear') {
      resetBuffer(true); // pełny reset
      return;
    }
    if (t.dataset.action === 'backspace') {
      stopTwoDigitTimer();
      if (buffer.length > 0) {
        buffer = buffer.slice(0, -1);
      } else if (lastCommitted) {
        lastCommitted = null;
      }
      renderBuffer();
      return;
    }
  });
}

// Przyciski w topbar
clearBtn.addEventListener('click', () => resetBuffer(true));
backspaceBtn.addEventListener('click', () => {
  stopTwoDigitTimer();
  if (buffer.length > 0) {
    buffer = buffer.slice(0, -1);
  } else if (lastCommitted) {
    lastCommitted = null;
  }
  renderBuffer();
});

// Start
renderBuffer();
