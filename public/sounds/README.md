# UI Sounds

## File presenti
- `horizontal.mp3` - Suono per navigazione orizzontale (← →)
- `vertical-up.mp3` - Suono per navigazione verticale su (↑)
- `vertical-down.mp3` - Suono per navigazione verticale giù (↓)

## ⚠️ IMPORTANTE: I suoni NON funzionano in Figma Make

Figma Make è un ambiente di preview e non supporta il caricamento di file audio esterni.

## Come abilitare i suoni quando esporti il progetto:

### 1. Esporta il progetto da Figma Make
Scarica il progetto completo sul tuo computer

### 2. Verifica i file MP3
Assicurati che i 3 file MP3 siano nella cartella `/public/sounds/`

### 3. Attiva il codice audio
Apri il file `/src/app/App.tsx` e cerca questa sezione (circa riga 575):

```typescript
// ============================================================================
// UI SOUNDS - ATTUALMENTE DISABILITATI (non funziona in Figma Make)
// ============================================================================
```

### 4. Decommenta il codice
Rimuovi `/*` all'inizio e `*/` alla fine del blocco commentato, e rimuovi la funzione placeholder

### 5. Avvia il progetto in locale
```bash
npm install
npm run dev
```

Ora i suoni funzioneranno! 🔊

## Personalizzazione

Puoi modificare il volume dei suoni cambiando questi valori (da 0.0 a 1.0):
```typescript
horizontal.volume = 0.5;  // 50% volume
verticalUp.volume = 0.5;
verticalDown.volume = 0.5;
```
