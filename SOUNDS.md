# 🔊 Come Abilitare i Suoni d'Interfaccia

## Stato Attuale
I suoni sono **DISABILITATI** perché Figma Make non supporta file audio esterni.
Il codice è pronto ma commentato.

## File Audio Pronti
I 3 file MP3 sono già presenti in `/public/sounds/`:
- ✅ `horizontal.mp3` - Navigazione orizzontale (← →)
- ✅ `vertical-up.mp3` - Navigazione verticale su (↑)  
- ✅ `vertical-down.mp3` - Navigazione verticale giù (↓)

---

## 📦 Quando Esporti il Progetto da Figma Make

### Step 1: Esporta il Progetto
1. Scarica il progetto completo da Figma Make
2. Estrai i file sul tuo computer

### Step 2: Attiva i Suoni

Apri il file `/src/app/App.tsx` e cerca la riga **575** circa:

```typescript
// ============================================================================
// UI SOUNDS - ATTUALMENTE DISABILITATI (non funziona in Figma Make)
// ============================================================================
```

**RIMUOVI** il commento `/*` e `*/` intorno a questo blocco:

```typescript
const [sounds] = useState(() => {
  const horizontal = new Audio('/sounds/horizontal.mp3');
  const verticalUp = new Audio('/sounds/vertical-up.mp3');
  const verticalDown = new Audio('/sounds/vertical-down.mp3');

  horizontal.volume = 0.5;
  verticalUp.volume = 0.5;
  verticalDown.volume = 0.5;

  return { horizontal, verticalUp, verticalDown };
});

const playSound = (type: 'horizontal' | 'verticalUp' | 'verticalDown') => {
  const audio = sounds[type];
  audio.currentTime = 0;
  audio.play().catch(() => {});
};
```

**RIMUOVI** la funzione placeholder:
```typescript
// Rimuovi questa riga:
const playSound = (_type: 'horizontal' | 'verticalUp' | 'verticalDown') => {};
```

### Step 3: Avvia il Progetto

```bash
# Installa le dipendenze (solo la prima volta)
npm install

# Avvia il server di sviluppo
npm run dev
```

Apri il browser e i suoni funzioneranno! 🎉

---

## ⚙️ Personalizzazione

### Cambiare il Volume
Modifica i valori da 0.0 (muto) a 1.0 (massimo):

```typescript
horizontal.volume = 0.3;  // 30% volume (molto soft)
verticalUp.volume = 0.5;  // 50% volume (medio)
verticalDown.volume = 0.8; // 80% volume (alto)
```

### Sostituire i Suoni
1. Sostituisci i file MP3 in `/public/sounds/`
2. Mantieni gli stessi nomi file OPPURE
3. Aggiorna i percorsi nel codice:
   ```typescript
   new Audio('/sounds/tuo-nuovo-suono.mp3')
   ```

### Disabilitare Temporaneamente
Commenta solo la chiamata `playSound()` nelle funzioni di navigazione, oppure imposta volume a 0:
```typescript
horizontal.volume = 0; // Muto
```

---

## ❓ Problemi Comuni

**I suoni non partono al primo click?**
- È normale, i browser bloccano l'autoplay
- Al primo click o pressione tasto, si sbloccheranno

**I suoni sono troppo forti/deboli?**
- Regola il `volume` tra 0.0 e 1.0

**Errore "Failed to load"?**
- Verifica che i file MP3 siano in `/public/sounds/`
- Controlla che i nomi file siano corretti (case-sensitive)

---

## 🎵 Formato Consigliato

- **Formato**: MP3
- **Durata**: < 0.5 secondi
- **Bitrate**: 128-192 kbps
- **Sample Rate**: 44.1 kHz
- **Volume**: Normalizzato (non troppo forte)
