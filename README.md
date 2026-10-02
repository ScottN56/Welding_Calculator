# Weld Calculator

Weld Calculator is an offline-first, mobile-first tool for selecting welding setup inputs and presenting a recommended starting range from explicitly supplied reference data. It is not a Welding Procedure Specification (WPS), and it does not guarantee weld quality or code compliance.

For critical or code work, follow the applicable WPS and equipment and consumable manufacturer recommendations.

## Development Status

- Supported process: GMAW / MIG.
- Planned processes: FCAW, GTAW and SMAW.
- Current GMAW parameter records are sample/unverified development data. They are not from welding references and must not be used to weld.
- No verified welding parameter data has been supplied yet. Production builds include verified records only and fail during data initialization if an unverified record is present in the production registry.
- Interpolation is disabled by default. Both neighboring records must explicitly set `interpolationPermitted: true`; settings are never extrapolated beyond reference ranges.
- Android and iOS Capacitor projects are scaffolded. Android can be built with Android Studio on a supported host; iOS requires macOS and Xcode.

## Requirements

- Node.js 22.12 or newer in the Node 22 line (Vite 8 requirement).
- npm.
- Android Studio for Android builds; macOS with Xcode for iOS builds.

## Install and Run

```sh
npm ci
npm run dev
```

Useful checks and builds:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The production build also runs `npm run verify:production-bundle`, which scans shipped text assets for sample/unverified data markers and fails on a match or missing build output.

`npm run cap` shows Capacitor CLI help. To synchronize the web build into native projects, run `npm run cap:sync` (builds first). `npm run cap:open` opens a selected native project; specify one with `npm run cap:open -- android` or `npm run cap:open -- ios`. Platform-specific aliases are also available as `npm run cap:open:android` and `npm run cap:open:ios`.

## Architecture

- `src/features/welding/types/`: process-specific source records, normalized records, inputs and recommendation result types.
- `src/features/welding/data/records/`: verified reference records, kept separate from development samples.
- `src/features/welding/data/sample/`: visibly labeled, unverified development-only data.
- `src/features/welding/data/normalize.ts`: converts reference chart units into canonical calculation units.
- `src/features/welding/data/registry.ts`: validates records and creates the process registry. Sample records are included for the Vite development server, not production builds.
- `src/features/welding/calculations/`: pure matching, thickness lookup, optional interpolation and no-extrapolation logic.
- `src/features/welding/conversions/`: unit conversion and display formatting.
- `src/features/welding/processes/`: per-process input/output definitions used by the UI.
- `src/components/`, `src/pages/`, `src/app/`: React interface and navigation; welding calculation logic stays outside components.
- `src/features/saved-settings/` and `src/storage/`: versioned local models and offline browser storage.
- `tests/welding/`: calculation, conversion, data validation and local-storage tests, independent of React rendering.

Canonical internal units are millimetres, millimetres per minute and litres per minute. Source records retain the units printed in their reference chart and are normalized before calculations.

## Adding Verified GMAW Records

Add verified datasets under `src/features/welding/data/records/gmaw/manufacturers/` with `defineVerifiedDataset` from `src/features/welding/data/datasets.ts`. Each dataset supplies source provenance and reviewer/date metadata once for its records. Enter only values explicitly present in the cited reference. Preserve the source publisher, document title, edition, page and URL where available, and set the verification identity/date only after the records have been checked against that source. Do not put verified data in `data/sample/`.

Each record must have a unique ID, material, thickness range and applicability, wire type and diameter, shielding gas, transfer mode, polarity, and the settings actually listed by the reference. Optional values should be omitted when the reference does not provide them. Set the record's `interpolation` policy to `linear` only when the cited reference or data owner explicitly permits interpolation; the default is `prohibited`. Run `npm test`, `npm run typecheck` and `npm run build` after data changes. Production initialization rejects any unverified record.

## Source-Specific Procedure References

The Reference page lists public Los Alamos National Laboratory WPS documents separately from calculator records. These entries are source-specific reading links, not verified calculator recommendations, and do not enter the welding registry. Follow each WPS's exact scope and companion-document, review, and authorization requirements. The approved procedure-source allowlist is limited to HTTPS PDFs under `engstandards.lanl.gov/esm/welding/welding_specs/`; this does not add LANL PDFs to the generic parameter importer.

## Official Source Import (Developer CLI)

```sh
npm run welding:import -- --list-sources
npm run welding:import -- --dry-run --url "<official-url>"
npm run welding:import -- --url "<official-url>"
```

For an official source downloaded manually in a normal browser, use the catalog-bound local-file command:

```sh
npm run welding:import-file -- --source lincoln-im591-application-chart --file ./source-input/im591.pdf
npm run welding:import-file -- --dry-run --source esab-exaton-309lmo-gmaw --file ./source-input/esab-page.html
```

The source ID is mandatory and must name an enabled entry in `scripts/welding-source-import/sources.ts`; arbitrary files cannot define trusted provenance. Supported file types are PDF, HTML, JSON and plain text, subject to the reviewed adapter: Lincoln accepts PDF and tab-delimited text with an explicit `Document title:` line, ESAB accepts saved HTML, and Miller accepts PDF, HTML and explicit public-table JSON. Local inputs are never marked verified. Provenance includes the catalog manufacturer, official URL, source ID/type, parsed document title, local basename, import timestamp, parser/version and SHA-256. The absolute filesystem path is not recorded. `source-input/` is gitignored; accepted snapshots are stored by hash under the gitignored staging directory and are not part of the app build.

Each successful local import records an import batch in `.welding-source-staging/imports.json`; staged rows retain that batch ID through JSON/CSV export. In development, open **Import Batches** and load this staging JSON to inspect source rows, warnings, validation results and duplicates, compare same-source snapshots by page/table/row identity and exact original source cells/units, export a batch, or remove a batch from the staging document. Deletion downloads a replacement staging JSON and does not alter verified production records. **Open in Review Queue** sends that batch's unverified rows to developer Data Entry. Batch comparison does not use normalized calculator values.

Only HTTPS URLs on `millerwelds.com`, `lincolnelectric.com`, `esab.com`, their exact `www` hosts, `prod.millerwelds.com`, and `ch-delivery.lincolnelectric.com` are approved. Other subdomains require explicit review before being added. Redirects cannot leave the approved manufacturer's hosts. HTTP errors, oversized downloads, malformed sources, and unsupported content fail without guessing values.

The ESAB parser supports static HTML product pages with an explicitly labeled **Recommended Welding Parameters** table. It extracts only clearly labeled diameter, current, voltage, and wire-feed cells. Dynamic JavaScript-only pages, spanning/multi-level tables and unrecognized formats require a separately reviewed adapter.

The Miller adapter reads explicitly labeled public HTML tables, embedded JSON tables, and supported text-based PDF tables. The strict embedded JSON layout is an object with a `tables` array, where each table has a string `title`, string `headers`, and string-array `rows`; optional `documentNumber` and `edition` describe the source. This is a supported extraction layout, not a claim about Miller's live calculator API or response schema. Arbitrary executable scripts are not evaluated; no private/undocumented endpoints are probed, and no authentication, access controls or CAPTCHAs are bypassed.

If a calculator page does not expose supported public data, the CLI reports `Official Miller calculator found, but no supported public data source is available for automated extraction.` and writes no staged rows. It reports detected source type, tables, classifications, parsed rows and classification-eligible rows. Live calculator availability must be checked against an actual public source; it has not been established by the fixture tests.

Miller classifications are `recommended-setting`, `machine-capability`, `machine-specific-setting`, `reference-guidance`, and `unsupported`. Titles such as **FCAW And MIG Process Parameters** are classified as machine capabilities, not thickness-specific weld recommendations. Only `recommended-setting` is eligible for eventual generic promotion, and it still requires complete valid source values, explicit process context and human verification. Classifications survive staging JSON/CSV re-export and manual editing. Source terminology and unit spelling are retained; aliases such as MIG to GMAW are not guessed. PDF support uses positioned text with no OCR or conversion.

The Lincoln adapter supports text-based PDF/manual tables titled **SUGGESTED SETTINGS FOR WELDING** or **APPLICATION CHART**, with explicit single-line headers and positioned cells. It uses PDF.js text matrices, normalizes page rotation, landscape orientation and dominant text rotation into page coordinates, then reconstructs rows independently of PDF item order. It reports page number, rotation, text-item count, detected headings, structured-extraction status and `manual-review-required` diagnostics. Pages with insufficient machine-readable text are retained for manual review; OCR is not used. Ambiguous/multi-line layouts, unknown headers and documents without a supported table do not yield guessed settings. Network downloads are limited to 5 MiB, local files to 25 MiB, and extraction to 100 pages. PDF document title metadata must be present.

Machine-control settings such as `B-3` stay in a separate `manufacturerMachineSetting` staging field with machine/manual metadata; they never become voltage, amperage or wire-feed settings. Dual-unit thickness remains literal source context, and `NONE` gas remains literal without an inferred FCAW/self-shielded mapping. Direct physical cells keep their published text and unit spelling, including `in/min`, `IPM`, `m/min`, `CFH` and `L/min`. Units not representable in existing generic fields remain evidence/review errors rather than being converted. No machine-code mapping is implemented. All extracted rows remain unverified and require separate human review.

Lincoln imports report direct parameter rows, machine-specific setting rows, unsupported rows, parse failures and skipped duplicates. Row identity includes document/manual, page/table, process, wire, gas, literal thickness, and published setting identity; byte-only PDF changes do not duplicate identical settings.

Exact source unit strings, headers and cells are retained in each row's raw evidence. Missing units/settings are not guessed or converted. Process, material, thickness, gas, polarity, transfer mode, positions, joints and gas flow are not inferred; incomplete rows intentionally carry validation/review errors. Source extraction is not verification.

Normal imports write `.welding-source-staging/imports.json` and exact downloaded/local HTML, PDF, JSON or text snapshots under `.welding-source-staging/sources/`. This directory is gitignored and outside production data. Import the JSON into the development **Data Entry** page for correction/review. Each row carries its manufacturer, official source URL, catalog source ID/type, title, manual number when available, PDF page/table or HTML table/row identifier, retrieval/import timestamp, local basename when applicable, parser name/version, and SHA-256 of the exact source bytes. Unchanged sources add no rows; changed local file content reports `Source snapshot changed; human review required.` and retains prior unverified rows without overwriting them. Dry runs parse and validate without creating or updating staging files.

Human source checking and promotion are separate explicit steps. Copilot must NEVER invent missing settings or mark imported data verified.

## Unified Source Scan

```sh
npm run welding:scan
npm run welding:scan -- --dry-run
npm run welding:scan -- --manufacturer miller
npm run welding:scan -- --manufacturer lincoln
npm run welding:scan -- --manufacturer esab
npm run welding:scan -- --process GMAW
npm run welding:scan -- --changed-only
```

The explicit catalog is `scripts/welding-source-import/sources.ts`. Its three enabled entries are ESAB United States Exaton 309LMo (GMAW), the publicly indexed Lincoln Electric `im591.pdf` content-delivery link, and the Miller Weld Setting Calculators overview. URLs were obtained from public manufacturer pages/indexed first-party links, not invented content endpoints. Process filtering uses only catalog-declared known or explicitly advertised processes; unknown source context is not inferred. Catalog classification is an expectation, not verification: the per-source outcome separately reports parsed classifications, warnings and unreadable layouts.

All sources route through the existing adapters. Scans report checked/unchanged/changed/failed sources, discovered/parsed/staged rows, duplicates, unsupported rows, and new rows needing human review, grouped by manufacturer, known process, and classification. Unclassified legacy adapter rows remain explicitly unclassified. Equal numerical settings from different manufacturers are not assumed to be duplicate recommendations; deterministic ID collisions are checked globally against source evidence and reported separately without overwriting existing staging rows.

`--changed-only` still downloads each selected source to hash its exact bytes, but skips parsing/staging when that hash matches the latest stored hash. Changed sources report `Source changed; human review required.` Failures are isolated; each includes source ID, URL, adapter and reason, and other sources continue. The CLI exits nonzero after reporting source failures or ID conflicts. Successful rows and source snapshots remain unverified staging data; no production records or verification rules are modified.

Normal scans atomically save the shared staging JSON and a `lastScan` report in `.welding-source-staging/imports.json`. Import that JSON through the development Data Entry page to see its small last-scan dashboard. No scan runs in the browser or production app. Dry runs fetch, parse and validate but save no rows, snapshots, hashes or last-scan report; `rowsStaged` is zero and `rowsRequiringReview` describes prospective new rows. Per-source changes and failures may both be counted if a changed document fails parsing.

## Official Source Discovery

```sh
npm run welding:discover
npm run welding:discover -- --manufacturer esab
npm run welding:discover -- --manufacturer lincoln
npm run welding:discover -- --manufacturer miller
npm run welding:discover -- --process GMAW
npm run welding:discover -- --process FCAW
npm run welding:discover -- --process GTAW
npm run welding:discover -- --process SMAW
npm run welding:discover -- --import-good
```

Discovery reads only approved manufacturer `robots.txt` and sitemap URLs, sitemap candidates and same-manufacturer document links. It applies each host's robots allow/disallow and crawl-delay rules, fails closed on redirects whose destination robots policy has not been checked, limits sitemap/page count and response size, and does not search third-party indexes, submit forms, or probe private APIs. Candidate reports separate machine readability (`excellent`, `good`, `manual-review`, `unsupported`) from calculator suitability (`generic-recommendation`, `machine-specific`, `machine-capability`, `consumable-reference`, `unsupported`). Fields come from explicit source labels; numeric-looking text does not create a field.

`--import-good` hands off only `excellent`/`good` candidates that the existing manufacturer adapter can parse. Imported rows remain unverified drafts in `.welding-source-staging/imports.json`; no discovery path promotes or verifies data. The deduplicated URL index is stored at `.welding-source-staging/discovery-index.json`. Use `--dry-run` to report without updating staging/index files.

## App Identifier

The current placeholder identifier is `com.example.weldcalculator`. When choosing the final ID, update the source locations below and then run Capacitor sync. The generated Capacitor config copies are listed for awareness; `cap sync` recreates them from `capacitor.config.ts`.

- `capacitor.config.ts`: Capacitor `appId` source of truth.
- `android/app/build.gradle`: Android `namespace` and `applicationId`.
- `android/app/src/main/java/com/example/weldcalculator/MainActivity.java`: Java package declaration and, if needed, its directory path.
- `android/app/src/main/res/values/strings.xml`: Android package name and custom URL scheme.
- `ios/App/App.xcodeproj/project.pbxproj`: iOS `PRODUCT_BUNDLE_IDENTIFIER` build settings.
- `android/app/src/main/assets/capacitor.config.json`: generated Android copy; regenerate via Capacitor sync.
- `ios/App/App/capacitor.config.json`: generated iOS copy; regenerate via Capacitor sync.

## Versioning Recommendation

Current values are not aligned: `package.json` is `0.1.0`; Android is `versionName "1.0"` and `versionCode 1`; iOS is `MARKETING_VERSION = 1.0` and `CURRENT_PROJECT_VERSION = 1`.

Recommended policy: keep semantic `package.json` version as the human-facing source of truth; mirror its major.minor.patch into Android `versionName` and iOS `MARKETING_VERSION`. Keep Android `versionCode` and iOS `CURRENT_PROJECT_VERSION` as monotonically increasing positive build numbers for each distributed native build. Until a dedicated version-sync tool is reviewed, update these fields together in the same change and verify them in review. This project does not automate publishing, signing or release numbering.

## Safety

Recommendations are starting points only. Actual settings depend on the machine, consumables, joint preparation and fit-up, position, shielding gas, manufacturer recommendations, applicable code requirements and the WPS. Never use sample/unverified data for welding.