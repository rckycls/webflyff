# FlyffWeb

A browser client for FlyFF. Node 24+ and npm 11+. Run `npm install` once in this folder.

The converter's texture stage also needs [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases) 4.3 or newer (`ktx`). It looks for `ktx` in the `KTX_BIN` environment variable, then on the `PATH`, then in `C:\Program Files\KTX-Software\bin\ktx.exe`.

## Layout

npm workspaces: `packages/*`, `tools/*`, `apps/*`.

| Folder | What |
| --- | --- |
| `packages/formats` | `@flyffweb/formats`: `BinaryReader`, `FormatError` and the readers for FlyFF binary formats. Every reader names the C++ function it copies. |
| `tools/convert` | `@flyffweb/convert`: Node converter from the read-only client folder to hashed web assets in `dist/assets`. CLI, client index, atomic writer, report and the texture stage (to `.ktx2`) are in; the model and world stages arrive in later tasks. |
| `apps/viewer` | Vite + Three.js viewer (added in a later task). |

## Client folder

Tests that read real game files need the FlyFF client folder. By default it is `../Client` (next to this folder); set `FLYFF_CLIENT` to use another path. It is read-only: nothing here writes into it. Without it, those tests are skipped with "Client/ not found — set FLYFF_CLIENT".

## Scripts

| Script | What |
| --- | --- |
| `npm test` | Unit tests (`vitest run`). Every `*.test.ts` in all workspaces except `*.corpus.test.ts` and `e2e/`. |
| `npm run test:corpus` | Corpus tests (`vitest run --config vitest.corpus.config.ts`). Read every real client file of a format; slow (10 minute timeout) and needs the client folder. |
| `npm run convert -- [options]` | Runs the converter (`tools/convert`). `--help` lists the options. Defaults: client from `FLYFF_CLIENT` or `../Client`, output in `dist/assets`. |
