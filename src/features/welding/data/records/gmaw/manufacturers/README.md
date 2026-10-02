# Verified GMAW Manufacturer Data

Add one dataset per manufacturer reference document under this directory. Use `exampleManufacturer.ts` as a metadata-only template; keep its records array empty until you are entering values transcribed from a real document.

## Workflow

Source PDF or chart → identify the exact page and table/chart → manually transcribe values → preserve the source units → create a verified dataset → validate dataset metadata and records → normalize through the existing data layer → pass records to the calculator engine.

When different rows come from different pages or tables in the same document, use a draft record's `sourceOverride` for only its page and/or table/chart reference. Keep shared publisher, document, edition, dates, URL and notes at dataset level. Source metadata helpers copy metadata only; they do not modify units or values.

## Data Rules

- Welding values must come from a real manufacturer or other explicitly supplied reference document.
- Never invent missing values. Omit fields the source does not provide.
- Never infer or extrapolate values from neighboring rows.
- Preserve the units exactly as printed in the source document; normalization happens after source data is loaded.
- Preserve provenance, including publisher, document title, edition or revision, page or chart reference, and source URL when available.
- Leave interpolation disabled (`interpolationDefault: 'prohibited'`) unless the source explicitly permits interpolation. Enable it only for data covered by that permission.
- Normally, one source document should be represented by one dataset.
- A dataset must be reviewed against its source and verified before production release.
- Copilot must NEVER generate welding parameter values for a template or dataset.

Run the typecheck, tests, lint, and production build after adding or changing source records. Production builds reject unverified records, and the production bundle check rejects sample-data markers.
