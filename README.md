# Daily Reps

A phone-first rep counter. Set a daily goal per exercise (for example 100 push-ups), log reps whenever you do them, and watch the ring fill to your goal. Counts reset at midnight.

Installs on an iPhone as a PWA (Safari → Share → Add to Home Screen), works offline, and keeps all data on the phone.

## Features

- Daily goal per exercise, counted in reps or seconds
- Your own quick buttons (for example +10, +15), plus any custom amount
- Undo, and a list of each set with its time
- Log for past days (up to 60 days back)
- Rest days with no goal
- Reorder exercises
- Confetti and a banner when you hit a goal
- History of the last 30 days
- Back up to a file and restore from it

## Stack

React 18, [Konsta UI](https://github.com/konstaui/konsta) (iOS components), [Magic UI](https://github.com/magicuidesign/magicui) (number ticker, progress ring, confetti, fade-in), Tailwind CSS 4, Vite, and vite-plugin-pwa.

## Run it

```bash
cd app
npm install
npm run dev
```

Build for production with `npm run build` (output in `app/dist`). Regenerate the app icons with `node scripts/make-icons.mjs`.

## Data

Everything is stored in the browser's `localStorage` on the device under `daily-reps-v1`. Nothing is sent to a server. Settings → Your data → Back up saves a JSON file you can restore later.

`daily-reps.html` in the repo root is the earlier single-file version that was published as a Claude artifact.
