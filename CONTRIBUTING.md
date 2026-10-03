# Contributing

Thanks for taking a look! The project is an npm-workspaces monorepo; see the
[project layout](README.md#project-layout) for what lives where.

## Setup

```sh
npm install          # Node.js 22.5 or newer
npm run dev:ui       # the app on http://localhost:5173
```

## Before you open a pull request

```sh
npm run check        # format check, lint, typecheck, all tests, build
npm run test:e2e     # browser smoke test (after `npm run build`)
```

`npm run format` fixes formatting (Prettier) for you.

## Conventions

- **Logic goes in `@pcad/core` or in pure modules** that don't touch React or
  the DOM (reducer, tool state machine, snapping, hit-testing), so it can be
  unit-tested. Components stay thin.
- **One place decides what is drawn.** `core/src/geom/flatten.ts` feeds the
  canvas, the PDF exporter and the DXF writer; don't re-implement geometry in
  a backend.
- **Add a test with every fix or feature**, and for a bug a regression test
  that fails without the fix.
- **Problems in a drawing are reported, not thrown.** The resolver returns
  `issues` and still draws everything it can.
- Keep the UI text and docs in English.
