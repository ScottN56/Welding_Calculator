# Weld Calculator

A mobile-first welding settings calculator built with React, TypeScript, Vite, and Capacitor.

## Status

This project is under active development.

Current process support:
- GMAW / MIG

Planned process support:
- FCAW
- GTAW / TIG
- SMAW / Stick

The application is designed to provide starting-point recommendations, not a Welding Procedure Specification (WPS).

## Welding-data safety

The current repository includes sample/unverified GMAW records for development and UI testing.

Those sample values are not from a verified welding reference and must not be used to weld.

Production releases are protected by two checks:

1. The production record list only accepts records from the verified data collection.
2. The production build scans the generated bundle and fails if sample-data markers are present.

Verified welding records must retain source provenance and verifier metadata.

## Install

Requirements:
- Node.js 22+
- npm
- Android Studio for Android builds
- macOS with Xcode for iOS builds

Install dependencies:

```bash
npm ci
```

## Development

Start the Vite development server:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Run TypeScript checks:

```bash
npm run typecheck
```

Run ESLint:

```bash
npm run lint
```

Create a production build:

```bash
npm run build
```

The production build also verifies the released welding-data set and scans the generated bundle for sample-data markers.

## Capacitor

Sync the web build into the native projects:

```bash
npm run cap:sync
```

Open Android Studio:

```bash
npm run cap:open:android
```

Open Xcode:

```bash
npm run cap:open:ios
```

## Architecture

Main source layout:

```text
src/
  app/
  components/
  features/
    welding/
      calculations/
      conversions/
      data/
      processes/
      troubleshooting/
      types/
    saved-settings/
    machine-profiles/
  hooks/
  pages/
  storage/
  styles/
  utils/
tests/
  welding/
```

Important design rules:

- Welding reference data is separate from calculation logic.
- Source records retain the units and provenance from the reference chart.
- Records are normalized into canonical units before calculations.
- Canonical units are mm, mm/min, and L/min.
- The engine does not extrapolate outside available data ranges.
- Interpolation is opt-in and disabled by default.
- React components do not contain welding calculation formulas.

## Adding verified welding records

Verified records belong under:

```text
src/features/welding/data/records/
```

Do not place production welding values in the sample-data directory.

Every verified record must:

- cite the publisher and document
- set `provenance.verified = true`
- include `verifiedBy`
- include `verifiedDate` in YYYY-MM-DD format
- pass record validation
- include an explicit interpolation policy when interpolation is intended

Example provenance shape:

```ts
provenance: {
  verified: true,
  source: {
    publisher: 'Manufacturer or standards body',
    document: 'Reference document title',
    edition: 'Optional edition',
    page: 'Optional page or chart',
    url: 'Optional source URL',
  },
  verifiedBy: 'Reviewer name or identifier',
  verifiedDate: '2026-10-01',
}
```

Interpolation is disabled unless explicitly enabled:

```ts
interpolation: {
  allowed: true,
  rationale: 'Why interpolation is appropriate for this specific reference data.',
}
```

If the source does not justify interpolation, omit the property or set `allowed: false`.

## Application identifier

The current placeholder identifier is:

```text
com.example.weldcalculator
```

Before publishing, update it consistently in these locations:

- `capacitor.config.ts`
- `android/app/build.gradle` (`namespace` and `applicationId`)
- `android/app/src/main/java/com/example/weldcalculator/MainActivity.java` (package declaration and directory path)
- `android/app/src/main/res/values/strings.xml`
- `ios/App/App.xcodeproj/project.pbxproj` (`PRODUCT_BUNDLE_IDENTIFIER`)

After changing the Capacitor app ID, run:

```bash
npm run cap:sync
```

## Versioning strategy

Use `package.json` as the human-readable application release version source.

Recommended mapping:

- `package.json version`: semantic release version, for example `0.2.0`
- Android `versionName`: same value as `package.json version`
- Android `versionCode`: monotonically increasing integer for every Play Store upload
- iOS `MARKETING_VERSION`: same value as `package.json version`
- iOS `CURRENT_PROJECT_VERSION`: monotonically increasing build number for every App Store/TestFlight upload

Keep store build numbers independent from semantic versioning because both stores require increasing build identifiers even when rebuilding the same release version.

## Safety

The calculator provides starting-point recommendations only.

Actual settings depend on the welding machine, consumables, joint preparation, fit-up, position, shielding gas, manufacturer recommendations, applicable code requirements, and welding procedure.

For critical or code work, follow the applicable WPS and equipment/consumable manufacturer recommendations.

Calculated values do not guarantee weld quality or code compliance.
