# mira/slides

MIRA's build of [Bento Slides](https://github.com/nyblnet/bento) (MIT, © 2026 The
Bento authors). It ships as the `mira-slides` skill in
[mira-skills](https://github.com/MIRA-Intelligence/mira-skills) and renders the
"Slides (HTML)" deliverable that MIRA previews inline.

Branch `mira-main` is the MIRA line. `main` mirrors upstream.

## What differs from upstream

The fork changes only what a MIRA user sees, plus the update channel:

| Where | Change |
| --- | --- |
| `slides/src/main.ts` | `appId: 'mira-slides'`, `appName: 'mira/slides'` (window title suffix). `manifestUrl: ''`. |
| `kernel/src/update.ts` | An empty manifest URL means no update check, so a MIRA deck is never offered an upstream Bento shell. |
| `slides/index.html` | `<title>`, splash wordmark (`MIRA/Slides`), and a NOTICE line pointing at this fork. The upstream notices stay intact. |
| `slides/package.json` | `build:single` writes `dist-single/Mira_Slides.html`. |

The `appId` change has two side effects. Autosave uses its own IndexedDB
(`mira-slides-autosave`). Signed language packs from bento.page are refused
(the bundled languages still work, and MIRA decks run offline anyway).

## What deliberately stays "bento"

These are the file format and tooling contract, not branding. Renaming them
would break existing decks, upstream `docs/agents.md`, and every agent or
tool that reads a deck:

- `"format": "bento/slides"`, `<script type="application/bento+json" id="bento-doc">`
- `window.bento.*`, the `bento-*` localStorage keys and DOM ids
- `<meta name="generator" content="bento-slides">` (the build tooling keys on it)

Editor UI strings (menus, tips, the 8 translations) also still say Bento.
MIRA opens decks read-only, so the editor never appears there. Rewording
those strings would turn every upstream sync into a translation merge.

## Build

```bash
cd slides && npm ci && npm run build:single
shasum -a 256 dist-single/Mira_Slides.html
```

Copy `dist-single/Mira_Slides.html` to
`builtin_skills/documents/mira-slides/assets/` in mira-skills, and record the
tag and sha256 in that skill's `SOURCE.md`.

## Sync with upstream

```bash
git fetch upstream --tags
git checkout mira-main
git rebase <upstream release commit>   # e.g. the "Release 1.2.8" commit
cd slides && npm ci && npm run build:single
```

Tag MIRA builds as `mira-v<upstream version>-<n>`, e.g. `mira-v1.2.7-1`.
