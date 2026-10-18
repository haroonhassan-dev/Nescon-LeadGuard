# Nescon-LeadGuard Design System Specification

**Design Theme**: NVIDIA-Inspired Industrial Precision  
**Tone**: High-Performance, Technical, Command-Center, Minimalist, Mission-Critical  
**Guiding Philosophy**: Extreme contrast, razor-sharp geometric borders, authoritative typography, zero fluff. No generic pastel gradients or sluggish glassmorphism.

---

## 1. Core Color Palette

| Token Name | Hex Code | Tailwind Utility | Visual Role |
|---|---|---|---|
| **Background** | `#0D1112` | `bg-[#0D1112]` | Deepest dark obsidian base for maximal readability and battery efficiency |
| **Surface** | `#171E1F` | `bg-[#171E1F]` | Elevated container surface for cards, panels, and sidebars |
| **Surface Elevated** | `#1F282A` | `bg-[#1F282A]` | Popovers, hover states, modal dialogs, and active table rows |
| **Lime Accent** | `#B7F45B` | `text-[#B7F45B]`, `bg-[#B7F45B]` | Primary brand accent, live operational telemetry, key action triggers |
| **Lime Hover** | `#A4E045` | `hover:bg-[#A4E045]` | Darkened tactile hover feedback on buttons |
| **Lime Muted** | `rgba(183, 244, 91, 0.12)` | `bg-[#B7F45B]/10` | Badges, highlighted rows, focus rings |
| **Text Primary** | `#F5F7F2` | `text-[#F5F7F2]` | High-contrast off-white for headers, values, and primary labels |
| **Text Muted** | `#8E9B9A` | `text-[#8E9B9A]` | Secondary information, timestamps, metadata, and placeholder text |
| **Border Primary** | `#242E30` | `border-[#242E30]` | Standard structural borders (1px solid crisp lines) |
| **Border Subtle** | `#1C2527` | `border-[#1C2527]` | Inner divider lines and inactive borders |
| **Danger / SLA Breach** | `#FF5C5C` | `text-[#FF5C5C]`, `border-[#FF5C5C]/30` | Critical escalations, missed deadlines, fatal errors |
| **Warning** | `#F5A623` | `text-[#F5A623]`, `border-[#F5A623]/30` | Approaching SLA deadline warnings, pending sync |
| **Info / Status** | `#56CCF2` | `text-[#56CCF2]` | General notifications, external webhook updates |

---

## 2. Typography Hierarchy

### 2.1 Font Families
- **Primary Interface**: `Inter, system-ui, -apple-system, sans-serif`
  - Font features: `"cv02", "cv03", "cv04", "cv11"` (tight geometric numerals)
- **Monospace Telemetry & Code**: `'JetBrains Mono', Menlo, Consolas, monospace`
  - Applied to timestamps, UUIDs, currency values, countdown timers, and API endpoints.

### 2.2 Scale & Weights
- **Display Header (H1)**: `text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F5F7F2]`
- **Section Title (H2)**: `text-xl font-bold tracking-tight text-[#F5F7F2]`
- **Card Header (H3)**: `text-base font-bold text-[#F5F7F2]`
- **Body Regular**: `text-sm text-[#F5F7F2] leading-relaxed`
- **Secondary Caption**: `text-xs text-[#8E9B9A]`
- **Telemetry Monospace**: `text-xs font-mono text-[#B7F45B]`

---

## 3. UI Component Directives

### 3.1 Buttons & Interactive Controls
- **Primary Action (NVIDIA Lime)**:
  `px-4 py-2.5 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-xs tracking-wide uppercase transition-colors shadow-sm`
- **Secondary Action (Dark Outline)**:
  `px-4 py-2.5 rounded-lg bg-[#0D1112] hover:bg-[#1F282A] text-[#F5F7F2] font-medium text-xs border border-[#242E30] transition-colors`
- **Ghost / Icon Button**:
  `p-2 rounded-lg text-[#8E9B9A] hover:text-[#F5F7F2] hover:bg-[#1F282A] transition-colors`

### 3.2 Cards & Containers
- Clean 1px border (`border border-[#242E30]`)
- No heavy outer drop shadows or blurred pastel glows
- Background: `#171E1F`
- Rounded corners: `rounded-xl`
- Padding: `p-6` for dashboard cards, `p-4` for compact list items

### 3.3 Status Badges
Status badges convey live operational states without clutter:
- **Active / Verified**: `bg-[#B7F45B]/10 text-[#B7F45B] border border-[#B7F45B]/30 rounded-full px-2.5 py-0.5 text-xs font-mono`
- **Pending / Inactive**: `bg-[#8E9B9A]/10 text-[#8E9B9A] border border-[#8E9B9A]/20 rounded-full px-2.5 py-0.5 text-xs font-mono`
- **SLA Breach / Urgent**: `bg-[#FF5C5C]/10 text-[#FF5C5C] border border-[#FF5C5C]/30 rounded-full px-2.5 py-0.5 text-xs font-mono`

### 3.4 Data Grids & Tables
- Dense, highly scannable rows with `h-10` to `h-12` heights
- Header row: `bg-[#0D1112] border-b border-[#242E30] text-xs font-mono text-[#8E9B9A] uppercase tracking-wider`
- Row hover state: `hover:bg-[#1F282A] transition-colors`
- Border separators: `divide-y divide-[#242E30]`

---

## 4. Visual Anti-Patterns (STRICTLY PROHIBITED)
1. **NO AI Gradients**: Avoid arbitrary purple-to-pink or blue-to-violet linear gradients.
2. **NO Excessive Frosted Glass**: Do not layer multiple high-opacity blurs (`backdrop-blur-xl`); they hurt performance and reduce contrast in data-heavy CRMs.
3. **NO Rounded Pill Everything**: Buttons and cards must feature disciplined, industrial radii (`rounded-lg` / `rounded-xl`), not stadium pills.
4. **NO Low-Contrast Text**: Never use `#4A5568` or dark grays against `#0D1112`. Secondary text must always meet minimum `#8E9B9A` luminance.
