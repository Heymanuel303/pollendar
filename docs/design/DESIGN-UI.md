# Pollendar UI — Design Language (Dusk Calendar)

Pollendar finds the time everyone can make. The name fuses *pollen* and *calendar*: each
participant's availability is a speck of pollen, and the moment the most pollen settles is the
slot that comes "into bloom." The mood is **dusk** — a deep violet night sky lit by warm
golden pollen, calm rather than corporate, so a quick scheduling chore feels gentle. It is built
for two people: the **creator** who spins up a poll and reads results, and the **participant**
who opens one link and marks when they're free.

## Design principles

- **The winner blooms.** The best slot is never just a bolded row — it visibly *blooms*: a warm
  pollen glow, a soft halo, and an "In bloom" marker. The eye should land on the answer first.
- **Pollen, not spreadsheets.** Availability is rendered as a living constellation of golden
  dots, not a dense grid of checkboxes. Density communicates consensus at a glance.
- **One link, no friction.** A participant should go from link to submitted in under a minute —
  no account, no app, just a name, an email, and a few taps.
- **Calm by default.** Dark, low-contrast surfaces and restrained motion keep the tool quiet.
  Color and glow are spent only on meaning (availability, the winner, errors).
- **Honest about time(zones).** Every poll shows its IANA timezone explicitly and can re-render
  each slot in the viewer's local zone, so "8pm" is never ambiguous.

## Color tokens

The palette is a dusk sky (violets) lit by pollen (golds), with three semantic availability
colors and two status accents. **`yes` is `pollen` by design** — saying "I'm free" is the same
warm gold that makes a slot bloom.

| Token        | Hex       | Role                                                          |
| ------------ | --------- | ------------------------------------------------------------ |
| `canvas`     | `#14122B` | App background — deepest dusk                                 |
| `surface`    | `#211E40` | Card / panel background                                       |
| `surface2`   | `#2B2752` | Raised surface, inputs, hover                                 |
| `line`       | `#36325E` | Borders, dividers, grid lines                                 |
| `pollen`     | `#FFC857` | Primary accent / brand gold; the bloom                       |
| `pollenDeep` | `#F0A93B` | Pressed / gradient-end gold, deeper pollen                    |
| `moonlight`  | `#F4F2FF` | Primary text — near-white                                     |
| `dim`        | `#B8B3DE` | Secondary text                                                |
| `mute`       | `#7E79AE` | Tertiary text, placeholders, captions                        |
| `yes`        | `#FFC857` | Availability: available (**== `pollen`**)                    |
| `maybe`      | `#B8B3DE` | Availability: maybe                                           |
| `no`         | `#3A3563` | Availability: unavailable                                     |
| `mint`       | `#6FE0B0` | Positive status — success, copied, completed                 |
| `coral`      | `#FF7A6B` | Negative status — errors, destructive actions                |

## Typography

Two families, both via Google Fonts:

- **Space Grotesk** — `--font-display`. Used for headings, the brand mark, and **all numerals**
  (tallies, counts, times, dates). Its geometric figures make numbers read as data.
- **Inter** — `--font-sans`. Used for all UI body text, labels, buttons, and paragraphs.

**Type scale** (rem):

| Step    | Size / line          | Family   | Use                                  |
| ------- | -------------------- | -------- | ------------------------------------ |
| display | 2.5rem / 1.1         | display  | Landing hero, big numbers            |
| h1      | 1.875rem / 1.2       | display  | Page titles                          |
| h2      | 1.375rem / 1.3       | display  | Section / card titles                |
| body-lg | 1.125rem / 1.6       | sans     | Lead paragraphs                      |
| body    | 1rem / 1.6           | sans     | Default text                         |
| small   | 0.875rem / 1.5       | sans     | Labels, captions                     |
| micro   | 0.75rem / 1.4        | sans     | Timezone notes, meta                 |

**Rule:** every numeral the user reads — counts, tallies, percentages, times, dates — is set in
`--font-display`, even inside `--font-sans` text. Wrap inline numbers in a `.num`
(`font-display`) utility where needed.

## Shape, depth & motion

**Radii** — soft, rounded, never sharp:

| Token  | Value    | Use                              |
| ------ | -------- | -------------------------------- |
| `lg`   | `0.75rem`| Buttons, inputs, small chips     |
| `xl`   | `1rem`   | Cards, list rows                 |
| `2xl`  | `1.5rem` | Hero panels, modals              |
| `full` | `9999px` | Pollen dots, toggles, avatars    |

**Depth** — `shadow-card`: a soft, low, diffuse shadow (`0 8px 24px rgb(0 0 0 / .35)`) lifts
cards off the `canvas` without harsh edges.

**The bloom** — reserved for the winning slot:

- `shadow-glow` — `0 0 0 1px rgb(255 200 87 / .55), 0 0 28px rgb(255 200 87 / .32)`: a pollen
  ring plus a warm outer halo.
- `.bloom-bg` — a faint radial pollen gradient washed behind the winner.
- `✦` — a small four-point sparkle glyph that marks the bloom ("✦ In bloom").

**Motion principles:**

- Two motions only: **settle** (things ease into place, slight upward drift + fade) and
  **bloom** (the winner's glow grows in).
- Durations **150–250ms**, `ease-out`. Nothing bounces, nothing loops.
- Respect `prefers-reduced-motion: reduce` — disable settle/bloom transitions and show the
  final state immediately (the glow stays as a static style, just un-animated).

## Signature motifs

- **The pollen-dot grain.** A subtle, very low-opacity scatter of tiny pollen dots
  (`.pollen-dot` / a repeating radial background) over `canvas` gives the dusk sky faint
  texture. Decorative only — never interactive, never high-contrast.
- **The constellation availability grid.** In `AvailabilityGrid` and `ResultsTable`, each
  respondent's "yes" is a filled pollen dot. Stacked across slots, popular times read as bright
  clusters — a constellation — so consensus is legible before any number is.
- **The "in bloom" best slot.** The winning slot combines `shadow-glow` + `.bloom-bg` + the `✦`
  marker and the "In bloom" label. It is the single loudest element on any results screen.
- **The brand mark.** A pollen dot (`pollen` on `canvas`) with a faint glow beside the wordmark
  "Pollendar" in `--font-display`. The dot doubles as the favicon and loading indicator.

## Component inventory

| Mockup component  | DESIGN.md §8 counterpart      | One-line spec                                                                 |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| EmailGate         | `EmailGate`                   | Email input + "Send magic link" button; success swaps to "Check your inbox."  |
| DateSlotEditor    | `DateSlotEditor`              | Add candidate dates; per date add slots (time range or all-day); remove rows. |
| AvailabilityGrid  | `AvailabilityGrid`            | Slots × the participant's yes/maybe/no toggles; the pollen constellation.     |
| AvailabilityToggle| (part of `AvailabilityGrid`)  | Tri-state control cycling yes (`yes`) / maybe (`maybe`) / no (`no`).           |
| ResultsTable      | `ResultsTable`                | Per-slot tallies as dot clusters + numbers; rows sortable by support.         |
| BestSlotBloom     | `BestSlotBadge`               | The blooming winner — `shadow-glow` + `.bloom-bg` + "✦ In bloom".             |
| ShareBox          | `ShareBox`                    | Copy public link + copy invite message; mint "Copied" confirmation.           |
| PollCard          | (Dashboard list item)         | One poll: title, status (e.g. "gathering responses"), response count, date.   |
| Buttons           | (shared)                      | Primary (pollen fill), secondary (line border), ghost, destructive (coral).   |
| Form fields       | (shared)                      | `surface2` inputs, `line` border, `mute` placeholder, coral error text.       |

## Screens

| Route                  | View          | Purpose                                              | Key components                                     |
| ---------------------- | ------------- | ---------------------------------------------------- | -------------------------------------------------- |
| `/`                    | `Landing`     | Pitch + "Sign in to create a poll" email box         | Hero, `EmailGate`, brand mark, pollen-dot grain    |
| `/auth/callback`       | `AuthCallback`| Transient: read `?token=`, POST `/auth/verify`, redirect | Brand-mark loader, spinner (no dedicated mockup) |
| `/dashboard`           | `Dashboard`   | List the creator's polls                             | `PollCard` list, "New poll" button, empty state    |
| `/polls/new`           | `PollEditor`  | Create poll (title, desc, dates, slots)              | Form fields, `DateSlotEditor`, primary button      |
| `/polls/:id`           | `PollManage`  | Results, share box, complete poll                    | `ResultsTable`, `BestSlotBloom`, `ShareBox`        |
| `/p/:token`            | `PublicPoll`  | Participant marks availability + name/email          | `AvailabilityGrid`, name/email fields, timezone note |
| `/p/:token/done`       | `PublicThanks`| Current best + share buttons                         | `BestSlotBloom`, `ShareBox`                         |

`AuthCallback` is a transient/loading screen — it has no dedicated mockup. It shows only the
brand mark as a quiet loading state while the magic-link token is verified, then redirects.

## Voice & microcopy

**Tone:** warm, plain, brief. Speak to one person. No jargon ("respondents" → "people"), no
exclamation spam, no dark-pattern urgency. Numbers and times stated honestly with their zone.

**Canonical strings:**

- Tagline — **"Find the time everyone can make."**
- Winner label — **"In bloom"** (rendered as "✦ In bloom").
- Reassurance on the create flow — **"Takes about a minute."**
- Poll status (open, accepting responses) — **"gathering responses"**.
- Magic-link confirmation — **"We'll email you a magic link."**

Supporting copy: "Copied" (mint, on share), "Mark when you're free", "This poll's times are in
{timezone}", and on completion "We've let everyone know" / "Closed".

## Implementing in the real app (Tailwind v4)

The mockups in `docs/design/mockups/` use the **Tailwind Play CDN** with an inline config block
(quick, self-contained, no build). The **real app** must not do this. Per DESIGN.md §8, the app
uses Tailwind v4 **CSS-first** configuration: `src/assets/main.css` is `@import "tailwindcss";`
imported once in `main.ts`, with theme tokens declared in an `@theme` block — **no
`tailwind.config.js`, no PostCSS, no v3 `@tailwind` directives.**

Port the design tokens into `src/assets/main.css`:

```css
@import "tailwindcss";
@theme {
  --color-canvas: #14122B;
  --color-surface: #211E40;
  --color-surface2: #2B2752;
  --color-line: #36325E;
  --color-pollen: #FFC857;
  --color-pollen-deep: #F0A93B;
  --color-moonlight: #F4F2FF;
  --color-dim: #B8B3DE;
  --color-mute: #7E79AE;
  --color-yes: #FFC857;
  --color-maybe: #B8B3DE;
  --color-no: #3A3563;
  --color-mint: #6FE0B0;
  --color-coral: #FF7A6B;
  --font-display: "Space Grotesk", ui-sans-serif, sans-serif;
  --font-sans: "Inter", ui-sans-serif, sans-serif;
  --shadow-glow: 0 0 0 1px rgb(255 200 87 / .55), 0 0 28px rgb(255 200 87 / .32);
}
```

Once declared in `@theme`, these tokens generate utilities automatically (`bg-canvas`,
`text-pollen`, `border-line`, `font-display`, `shadow-glow`, etc.), so component templates use
plain Tailwind classes.

The motif helpers that aren't pure utilities become small custom classes in the same
`main.css` (below the `@theme` block, e.g. via `@layer components` / `@utility`):

- **`.bg-dusk`** — the `canvas` base plus the pollen-dot grain background.
- **`.pollen-dot`** — the round pollen marker used in the constellation grid.
- **`.bloom`** — applies `shadow-glow` to the winning slot.
- **`.bloom-bg`** — the faint radial pollen wash behind the winner.

**Fonts:** load Space Grotesk and Inter via a `<link>` to Google Fonts in `index.html`, or
prefer `@fontsource/space-grotesk` + `@fontsource/inter` imported in `main.ts` to self-host and
avoid a render-blocking external request. The `--font-display` / `--font-sans` tokens above name
those families.

## Mockups

Static design mockups live in `docs/design/mockups/` as standalone HTML cards (each self-renders
via the Tailwind Play CDN, no build step) and are also pushed to the **"Pollendar UI"** Claude
Design project. They are grouped:

- **Overview** — design-language summary and the brand mark.
- **Foundations** (`mockups/foundations/`) — color tokens, typography, shape/depth/motion.
- **Components** (`mockups/components/`) — each entry in the component inventory above.
- **Screens** (`mockups/screens/`) — each route in the screens table above.

To browse locally, open **`docs/design/mockups/index.html`** in a browser; it links every card.
The mockups are the visual source of truth that this document translates into the real Vue 3 +
Tailwind v4 build.
