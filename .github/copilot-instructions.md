# GitHub Copilot instructions for Weld Calculator

Follow these rules for every change in this repository.

## Welding data and safety

- NEVER invent welding parameters.
- NEVER mark AI-generated welding parameters as verified.
- Welding recommendations must originate from explicitly supplied reference data.
- Preserve source provenance for every verified welding record.
- Never extrapolate beyond verified reference-data ranges.
- Only interpolate when the reference-data configuration explicitly permits it.
- Do not silently replace unsupported combinations with approximate settings.
- Do not weaken or remove safety notices.
- For critical or code work, the application must continue directing users to the applicable WPS and manufacturer recommendations.

## Architecture

- Keep welding calculation logic outside React components.
- Keep source welding data separate from normalized calculation data.
- Canonical internal units remain mm, mm/min, and L/min.
- Preserve strict TypeScript.
- Prefer small, testable calculation functions.
- Do not duplicate calculation logic in UI code.

## Testing

- Update or add tests whenever calculation behavior changes.
- Preserve tests for:
  - unit conversion
  - thickness lookup
  - unsupported combinations
  - no extrapolation
  - interpolation permissions
  - production-data verification
- Production builds must continue failing if sample/unverified welding data is included in the production data set or emitted in the production bundle.

## Data quality

- Verified records must include publisher/document provenance.
- Verified records must include verifiedBy and verifiedDate.
- Interpolation defaults to disabled.
- Sample data is development-only and must remain clearly marked as unverified.
