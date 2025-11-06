# Przeglądarka kart 000–499 (Node + JS)

Aplikacja pozwala wpisać z klawiatury numerycznej numer karty (000–499). Po wpisaniu 3 cyfr automatycznie pojawia się karta oraz tłumaczenie PL.

## Szybki start
1. Skopiuj repozytorium/katalog.
2. `cp .env.example .env` (ew. dopasuj PORT/ścieżki jeśli zmieniasz lokalizacje plików).
3. Skopiuj wszystkie obrazy kart JPG do `public/cards/`.
4. Umieść CSV z danymi kart w `data/cards.csv` (lub dostosuj ścieżkę w `.env`).
5. `npm install`
6. `npm run dev`
7. Otwórz `http://localhost:5173/`

## Format CSV
Oczekiwane nagłówki (kolejność dowolna, nazwy dokładnie jak poniżej):

```
filename,text,number,card name,type,description,instruction,description_pl,instruction_pl
```

Przykładowe 2 wiersze (zachowaj cudzysłowy wokół pól wielolinijkowych):

```
./log-card-000-adaptive-tinkerer-1.jpg,"o£ _ Adaptive Tinkerer\n> ,\\\n> — off 3 p ZZ PaK = ty\nYou can be and accomplish\nanything you want, and so can\nyour items. You ve learned to see\nin them new forms and functions,\nhowever temporary they may be.\nBefore skill checks, you may return\none item & to AIM to get GRD.",0,Adaptive Tinkerer,Adventurer status,"You can be and accomplish\nanything you want, and so can\nyour items. You ve learned to see\nin them new forms and functions,\nhowever temporary they may be.","Before skill checks, you may return\none item & to AIM to get GRD.",,
./log-card-000-deep-intuition-1.jpg,"cy | Deep Intuition >\n| „aaa na „PB 1,\nONE Se 8\nYour imaginative, empathic nature\nmanifests in a peculiar understanding of\nothers and the world. When inspiration\nstrikes, your heart can guide you.\nIn H or © skill check, you\nmay discard to get (1%)\nThen you may roll @.\n1 - 3: Get GER.\n4 - 12: Get GK) and\nyou may roll @ again.",0,Deep Intuition,Adventurer status,"Your imaginative, empathic nature\nmanifests in a peculiar understanding of\nothers and the world. When inspiration\nstrikes, your heart can guide you.","In H or © skill check, you\nmay discard to get (1%)\nThen you may roll @.\n1 - 3: Get GER.\n4 - 12: Get GK) and\nyou may roll @ again.",,
```

> Uwaga: `filename` może zaczynać się od `./` — backend to znormalizuje. `number` może być `0..499`. W UI wpisujesz 3 cyfry: `000..499`.

## Skróty klawiszowe
- Po prostu wpisz trzy cyfry (także z bloku numerycznego). Po trzeciej cyfrze karta ładuje się sama.
- `Backspace` usuwa ostatnią cyfrę, `Escape` czyści wejście.

## API
- `GET /api/card/:number` → zwraca dane karty (JSON) wg numeru 0..499. Parametr akceptuje `"000".."499"` albo `0..499`.
```
{
  "number": 0,
  "filename": "log-card-000-adaptive-tinkerer-1.jpg",
  "imageUrl": "/cards/log-card-000-adaptive-tinkerer-1.jpg",
  "card_name": "Adaptive Tinkerer",
  "type": "Adventurer status",
  "description": "...",
  "instruction": "...",
  "description_pl": "...",
  "instruction_pl": "...",
  "raw_text": "..."
}
```

## Dostosowanie
- Jeśli w CSV `description_pl`/`instruction_pl` są puste, w UI pokaże się wersja EN jako fallback.
- Możesz zmienić kolory i layout w `public/styles.css`.