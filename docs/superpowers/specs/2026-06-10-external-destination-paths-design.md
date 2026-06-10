# External destination paths for processed files

## Problem

Today, processed files end up in folders inside the project tree:
- Bulk Excel/CSV files (`EXCEL_OK`) are moved to `OCR_PATH` (`./local/ocr`) after `MassiveExcelService.process()` finishes — even though they need no further processing.
- OCR/PDF documents (`IA_OK`) are moved to `DONE_PATH` (`./local/done`) by `ModelProcessor` after the model step succeeds.

We need processed files to land in folders **outside the project**, configured via env vars, so they can be archived/served by other systems.

## Design

Two new env vars (absolute paths, expected to point outside the repo):

- `EXCEL_DESTINATION_PATH` — final destination for processed Excel/CSV bulk files. Used in `OcrProcessor` (the `.xlsx/.xls/.csv` branch), replacing the current move to `OCR_PATH`.
- `OCR_DESTINATION_PATH` — final destination for OCR/PDF documents after successful model extraction. Used in `ModelProcessor`, replacing `DONE_PATH`.

Both default to `./local/excel-done` and `./local/ocr-done` respectively (mirroring existing conventions) if unset, but are documented as intended to be set to an external absolute path.

### Changes

1. `src/common/config/env.validation.ts` — add `EXCEL_DESTINATION_PATH?` and `OCR_DESTINATION_PATH?` as optional strings.
2. `src/modules/ocr/ocr.processor.ts` — in the Excel/CSV branch, resolve and use `EXCEL_DESTINATION_PATH` instead of `this.ocrPath` for the post-processing move.
3. `src/modules/model/model.processor.ts` — replace `this.donePath` (from `DONE_PATH`) with a path resolved from `OCR_DESTINATION_PATH`.
4. `src/common/services/folder-initializer.service.ts` — ensure `EXCEL_DESTINATION_PATH` and `OCR_DESTINATION_PATH` exist on bootstrap; remove `DONE_PATH` initialization.
5. `src/modules/extraction/extraction.service.ts` — remove `DONE_PATH` from the daily cleanup `pathsToClean` list (external archive folders are not auto-cleaned by the retention cron).
6. `.env.example`, `docker-compose.yml`, `README.md` — remove `DONE_PATH`, document the two new vars under the Paths section.

### Out of scope

- No change to the intermediate use of `OCR_PATH` for OCR/PDF documents awaiting model processing (`cola_modelo`).
- No change to `MassiveExcelService` internals beyond the destination path used by the caller.

## Testing

- Manual local run: process a small Excel file and a PDF, verify they land in the configured `EXCEL_DESTINATION_PATH` / `OCR_DESTINATION_PATH` folders instead of `OCR_PATH`/`DONE_PATH`.
- `pnpm lint` after changes.
