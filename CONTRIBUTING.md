# Contributing

Thanks for your interest in improving `@datocms/content-link`! This guide
outlines the setup required to work on the project and the expectations for
pull requests.

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Build the TypeScript sources**

   ```bash
   npm run build
   ```

3. **Run the test suite**

   ```bash
   npm run test
   ```

   Integration tests require a `.env.visual-editing` file (see
   `.env.example`) pointing at a preview-enabled DatoCMS project.

## Development scripts

- `npm run test:watch` – watch mode for the Vitest suite.
- `npm run lint` – ESLint over `src/` and `tests/`.
- `npm run format` / `npm run format:check` – Prettier helpers.
- `npm run clean` – remove compiled output under `dist/`.

## Coding guidelines

- TypeScript strict mode is enforced – avoid `any` and prefer explicit types.
- Keep implementation under `src/`; public re-exports live in `src/index.ts`.
- To add new examples, update the snippets under `examples/` and the README.
- Regenerate `dist/` via `npm run build`; never edit compiled files manually.

## Pull requests

Before opening a PR:

1. Run `npm run lint`, `npm run format:check`, and `npm run test`.
2. Update documentation (`README.md`, `CHANGELOG.md`, `examples/`) when the
   public API or integration steps change.
3. Include screenshots or recordings when UI behaviour (overlays/dev panel)
   changes visibly.

We use conventional, present-tense commit messages (e.g. `add overlay helper`).
Large changes are easier to review as multiple focused commits.

Thanks again for contributing!

