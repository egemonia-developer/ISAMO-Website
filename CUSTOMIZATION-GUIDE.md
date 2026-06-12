# 🎨 Guida Personalizzazione Interfaccia

## 🎯 CAMBIARE ICONE

### Dove Trovare le Icone nel Codice

File: `/src/app/App.tsx`

- **Riga ~3**: Import delle icone
- **Riga ~34**: Icone categorie principali (Curated/Community)
- **Riga ~40-540**: Icone sottocategorie (01-11) e assi (x/y/z)

### SVG Custom

**1. Crea la struttura:**
```bash
mkdir -p src/app/components/icons
```

**2. Crea file icona** `src/app/components/icons/MiaIcona.tsx`:

```typescript
export const MiaIcona = ({ 
  className,
  strokeWidth = 2 
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
      {/* Inserisci qui il tuo path SVG */}
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
};
```

**3. Importa in** `/src/app/App.tsx`:

```typescript
import { MiaIcona } from './components/icons/MiaIcona';

// Usa normalmente:
{
  icon: MiaIcona,
  // ...
}
```

**Dove trovare SVG:**
- https://heroicons.com/
- https://phosphoricons.com/
- https://tabler-icons.io/
- https://fonts.google.com/icons

---

## 🎨 ESEMPI PRATICI

### Esempio 1: Tema Tech/Monospace

**Font:**
```css
/* fonts.css */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500&display=swap');
```

```css
/* theme.css */
:root {
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.02em;
}
```

**Icone:**
```typescript
import { 
  Terminal,    // Curated
  Users,       // Community
  ArrowRight,  // X axis
  ArrowUp,     // Y axis
  Layers,      // Z axis
  Binary,      // Digital
  Code,        // Abstract
} from 'lucide-react';
```

### Esempio 2: Tema Organic/Soft

**Font:**
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');
```

**Icone:**
```typescript
import { 
  Sparkles,    // Curated
  Heart,       // Community
  Wind,        // Movement
  Waves,       // Ambient
  Flower,      // Organic
  Cloud,       // Abstract
} from 'lucide-react';
```

---

## ⚡ QUICK REFERENCE

### File da Modificare

1. **Font**: 
   - `/src/styles/fonts.css` (import)
   - `/src/styles/theme.css` (applicazione)

2. **Icone**:
   - `/src/app/App.tsx` (riga ~3 e ~34-540)
   - (opzionale) `/src/app/components/icons/` (custom SVG)

### Comandi Utili

```bash
# Crea cartella font locali
mkdir -p public/fonts

# Crea cartella icone custom
mkdir -p src/app/components/icons
```

### Link Risorse

- **Lucide Icons**: https://lucide.dev/icons/
- **Google Fonts**: https://fonts.google.com/
- **Font Squirrel** (download): https://www.fontsquirrel.com/
- **Heroicons**: https://heroicons.com/
