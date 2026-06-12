# Font Custom: Isamo Rasterize

## ⚠️ IMPORTANTE

Figma Make **NON supporta** il caricamento di file font (.ttf, .woff, .otf).

Il font **NON funzionerà** finché non esporti il progetto.

---

## 📦 Quando Esporti il Progetto

### Step 1: Carica il Font
Posiziona il file **`isamo-rasterize.ttf`** in questa cartella:
```
/public/fonts/isamo-rasterize.ttf
```

### Step 2: Verifica la Configurazione
Il CSS è già configurato in `/src/styles/fonts.css`:
```css
@font-face {
  font-family: 'Isamo Rasterize';
  src: url('/fonts/isamo-rasterize.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
```

### Step 3: Avvia il Progetto
```bash
npm install
npm run dev
```

Il font verrà applicato automaticamente! ✨

---

## 🎨 Font Applicato

Il font è già configurato in `/src/styles/theme.css`:
```css
:root {
  font-family: 'Isamo Rasterize', sans-serif;
}
```

Verrà applicato a tutta l'interfaccia.

---

## 🔄 Alternative (se il .ttf non funziona)

Se hai problemi con il formato .ttf, converti in .woff2 (più performante):

1. Usa https://transfonter.org/ o https://cloudconvert.com/ttf-to-woff2
2. Carica il file .woff2 qui
3. Aggiorna `/src/styles/fonts.css`:
```css
@font-face {
  font-family: 'Isamo Rasterize';
  src: url('/fonts/isamo-rasterize.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
```
