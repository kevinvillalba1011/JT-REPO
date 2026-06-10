# Remove FTP/Gmail modes (LOCAL-only)

## Problem

The project currently supports three `GLOBAL_MODE` values (`LOCAL`, `FTP`, `GMAIL`) across `extraction`, `client`, and `report` modules, each with a dedicated strategy implementation. In practice only `LOCAL` is used. The FTP/Gmail code, env vars, and dependencies are dead weight.

## Design

Collapse to LOCAL-only by removing the FTP/Gmail strategy implementations and the `GLOBAL_MODE` branching, leaving each service to use its `Local*Strategy` directly.

### Files removed

- `src/modules/extraction/strategies/ftp-file.strategy.ts`
- `src/modules/extraction/strategies/gmail-file.strategy.ts`
- `src/modules/client/strategies/ftp-client.strategy.ts`
- `src/modules/client/strategies/gmail-client.strategy.ts`
- `src/modules/report/strategies/ftp-report.strategy.ts`
- `src/modules/report/strategies/gmail-report.strategy.ts`
- `ftp_flow.md`

The `FileExtractorStrategy`, `ClientSourceStrategy`, `ReportStrategy` interfaces and the `Local*` implementations are unchanged.

### Service changes

- `extraction/extraction.service.ts`: remove `gmailStrategy`/`ftpStrategy` constructor injections and the `GLOBAL_MODE` switch in `handleCron`; call `this.localStrategy.extractFiles(...)` directly.
- `report/report.service.ts`: same pattern — remove FTP/Gmail injections and switch, use `this.localStrategy.saveReport(...)` directly.
- `client/client.service.ts`: remove FTP/Gmail injections and switch; remove the `isGmailMode`/`GMAIL_MODE_ALWAYS_TRUE` sentinel handling — `isClient` is based purely on the locally-loaded client ID set.

### Module changes

- `extraction/extraction.module.ts`, `report/report.module.ts`, `client/client.module.ts`: remove `Ftp*`/`Gmail*` providers.

### Env / config / deps

- Remove `GLOBAL_MODE` entirely (no longer a switch — code always behaves as LOCAL): from `.env`, `.env.example`, `docker-compose.yml`, README, CLAUDE.md, and any code reading it.
- Remove `FTP_*` (including `FTP_CLIENTS_PATH`) and `GMAIL_*` env vars from `.env`, `.env.example`, README. `CSV_CLIENTS_FILE` stays — it's used by `LocalClientStrategy`.
- Remove `basic-ftp` and `imapflow` from `package.json` dependencies, run `pnpm install` to update the lockfile.

### Documentation

- Update `README.md` and `CLAUDE.md`: remove the "Modos de Operación" sections describing FTP/Gmail, GLOBAL_MODE references, and the FTP/Gmail env var docs. Keep the LOCAL-mode description as the only mode.

## Out of scope

- `report`/`client` module removal (separate iteration, larger change touching `model.processor.ts` and tenant profiles).

## Testing

- `pnpm lint` after changes.
- `pnpm build` to confirm no leftover references/compile errors.
- Manual local run: confirm extraction/report/client services still work in LOCAL mode.
