# 🎨 Icone Custom - Guida Completa

## 📂 Struttura

Questa cartella contiene le icone personalizzate per l'interfaccia.

---

## 🔧 Come Creare un'Icona Custom

### Opzione 1: Da un File SVG Esistente

**1. Apri il tuo file .svg in un editor di testo**

**2. Trova il contenuto tra i tag `<svg>...</svg>`**

Esempio:
```svg
<svg viewBox="0 0 24 24">
  <path d="M12 2L2 7v10l10 5 10-5V7L12 2z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>
```

**3. Crea un nuovo file** (es: `MiaIcona.tsx`)

```typescript
export const MiaIcona = ({
  className,
  strokeWidth = 1.5
}: {
  className?: string;
  strokeWidth?: number;
}) => {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* INCOLLA QUI IL CONTENUTO DEL TUO SVG */}
      <path d="M12 2L2 7v10l10 5 10-5V7L12 2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
};
```

### Opzione 2: Disegnare da Zero

Usa strumenti come:
- **Figma** → Export as SVG
- **Illustrator** → Save as SVG
- **Inkscape** (gratis)

Poi segui i passi dell'Opzione 1.

---

## 🔄 Come Sostituire le Icone nell'Interfaccia

### Passo 1: Crea le Tue Icone

Esempio: vuoi sostituire l'icona **Star** (Curated)

Crea il file `/src/app/components/icons/CuratedIcon.tsx`:

```typescript
export const CuratedIcon = ({
  className,
  strokeWidth = 1.5
}: {
  className?: string;
  strokeWidth?: number;
}) => {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Il tuo SVG custom */}
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
};
```

### Passo 2: Importa nel File Principale

Apri `/src/app/App.tsx` e **SOSTITUISCI** l'import:

**PRIMA:**
```typescript
import { Star, Users, ... } from 'lucide-react';
```

**DOPO:**
```typescript
import { Users, ... } from 'lucide-react';
import { CuratedIcon } from './components/icons/CuratedIcon';
```

### Passo 3: Sostituisci l'Icona

Trova la riga (~38) dove è definita la categoria:

**PRIMA:**
```typescript
{
  id: 'curated',
  label: 'Curated',
  icon: Star,  // ← icona Lucide
  sections: [...]
}
```

**DOPO:**
```typescript
{
  id: 'curated',
  label: 'Curated',
  icon: CuratedIcon,  // ← tua icona custom
  sections: [...]
}
```

---

## 📋 Lista Completa delle Icone da Sostituire

### Layer Principale (Riga ~34-540)

| Categoria | Icona Attuale | File da Creare |
|-----------|---------------|----------------|
| Curated | `Star` | `CuratedIcon.tsx` |
| Community | `Users` | `CommunityIcon.tsx` |
| Settings | `Settings` | `SettingsIcon.tsx` |

### Sezioni Movement (01)

| Categoria | Icona Attuale | File da Creare |
|-----------|---------------|----------------|
| movimento x axis | `MoveHorizontal` | `XAxisIcon.tsx` |
| movimento y axis | `MoveVertical` | `YAxisIcon.tsx` |
| movimento z axis | `Move3d` | `ZAxisIcon.tsx` |

### Sezioni Impact (02)

| Categoria | Icona Attuale | File da Creare |
|-----------|---------------|----------------|
| soft impact | `Circle` | `SoftImpactIcon.tsx` |
| hard impact | `Zap` | `HardImpactIcon.tsx` |

### ... e così via per tutte le categorie

---

## 💡 Tips & Tricks

### Mantenere la Coerenza

- Usa sempre `viewBox="0 0 24 24"` per dimensioni uniformi
- Usa `stroke="currentColor"` per ereditare il colore dal CSS
- Usa `fill="none"` se vuoi solo il contorno (stile lineare)
- Usa `fill="currentColor"` se vuoi riempire forme solide

### Stile Minimale (come l'interfaccia)

```typescript
// Lineare (stroke only)
<path d="..." fill="none" stroke="currentColor"/>

// Solido (fill only)
<path d="..." fill="currentColor" stroke="none"/>

// Misto
<circle fill="currentColor"/>
<path stroke="currentColor" fill="none"/>
```

### Testare le Icone

Dopo aver creato un'icona, testala sostituendola temporaneamente:

```typescript
icon: MiaIcona,  // ← testa qui
```

Ricarica la pagina e verifica che appaia correttamente.

---

## 🚀 Esempio Completo: Sostituire TUTTE le Icone

**1. Crea i file icona** (uno per tipo):

```
/src/app/components/icons/
  ├── CuratedIcon.tsx
  ├── CommunityIcon.tsx
  ├── SettingsIcon.tsx
  ├── XAxisIcon.tsx
  ├── YAxisIcon.tsx
  ├── ZAxisIcon.tsx
  ├── SoftImpactIcon.tsx
  ├── HardImpactIcon.tsx
  └── ... (tutte le altre)
```

**2. Importale in App.tsx:**

```typescript
import { Play, Pause, RotateCcw, Search } from 'lucide-react'; // solo quelle del player
import { CuratedIcon } from './components/icons/CuratedIcon';
import { CommunityIcon } from './components/icons/CommunityIcon';
import { XAxisIcon } from './components/icons/XAxisIcon';
// ... tutte le altre
```

**3. Sostituisci nel data:**

```typescript
const mainCategories = [
  {
    id: 'curated',
    label: 'Curated',
    icon: CuratedIcon,  // ← custom
    sections: [
      {
        id: '01',
        label: 'Movement',
        categories: [
          {
            id: 'x-axis',
            label: 'movimento x axis',
            icon: XAxisIcon,  // ← custom
            // ...
          }
        ]
      }
    ]
  }
];
```

---

## ❓ Problemi Comuni

**L'icona non appare?**
- Controlla che il `viewBox` sia corretto
- Verifica che `stroke="currentColor"` sia presente
- Controlla la console per errori

**L'icona è troppo grande/piccola?**
- L'interfaccia usa `w-8 h-8`, `w-5 h-5`, `w-4 h-4`
- Il `viewBox="0 0 24 24"` si adatta automaticamente

**L'icona ha colori strani?**
- Rimuovi attributi `fill="#..."` hardcoded
- Usa `fill="currentColor"` o `fill="none"`

---

## 📚 Risorse Utili

- **SVG Optimizer**: https://jakearchibald.github.io/svgomg/
- **Inkscape** (free SVG editor): https://inkscape.org/
- **Figma** → Export SVG

---

## ✅ Checklist

- [ ] Creare file icona .tsx
- [ ] Importare in App.tsx
- [ ] Sostituire nel data `mainCategories`
- [ ] Testare visivamente
- [ ] Rimuovere import Lucide non più usati
