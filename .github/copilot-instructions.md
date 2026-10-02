# Project Instructions

- NEVER invent welding parameters.
- NEVER mark AI-generated welding parameters as verified.
- Welding recommendations must originate from explicitly supplied reference data.
- Preserve source provenance for every verified welding record.
- Never extrapolate beyond verified reference-data ranges.
- Only interpolate when the reference-data configuration explicitly permits it for both records.
- Keep welding calculation logic outside React components.
- Keep source data separate from normalized calculation data.
- Canonical internal units remain mm, mm/min and L/min.
- Preserve strict TypeScript; do not weaken compiler settings to bypass errors.
- Update or add automated tests whenever calculation behavior changes.
- Do not weaken or remove safety notices.
- Do not silently replace unsupported combinations with approximate settings.
- For critical/code work, continue directing users to the applicable WPS and equipment and consumable manufacturer recommendations.
- Keep unverified samples development-only; production builds must reject unverified parameter records.