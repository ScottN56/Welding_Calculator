import { describe, expect, it } from 'vitest';
import { registry } from '../src/features/welding/data/registry';
import { LANL_PROCEDURE_REFERENCES } from '../src/features/welding/data/procedureReferences';
import { APPROVED_PROCEDURE_SOURCES, approvedProcedureUrl } from '../src/features/welding/data/procedureSources';

describe('source-specific LANL procedure references', () => {
  it('keeps one cited, restricted reference for each remaining process', () => {
    expect(new Set(LANL_PROCEDURE_REFERENCES.map((procedure) => procedure.process))).toEqual(new Set(['FCAW', 'GTAW', 'SMAW']));
    expect(LANL_PROCEDURE_REFERENCES.every((procedure) => procedure.useRequirements.length > 0)).toBe(true);
    expect(LANL_PROCEDURE_REFERENCES.every((procedure) => procedure.classification === 'procedure-reference')).toBe(true);
    expect(LANL_PROCEDURE_REFERENCES.find((procedure) => procedure.process === 'SMAW')?.useRequirements.join(' ')).not.toContain('subcontractor’s risk');
    expect(LANL_PROCEDURE_REFERENCES.filter((procedure) => procedure.process !== 'SMAW').every((procedure) =>
      procedure.useRequirements.join(' ').includes('subcontractor’s risk'),
    )).toBe(true);
  });

  it('allows only public LANL welding-procedure PDFs on the approved host/path', () => {
    expect(APPROVED_PROCEDURE_SOURCES.map((source) => source.hostname)).toEqual(['engstandards.lanl.gov']);
    for (const procedure of LANL_PROCEDURE_REFERENCES) {
      expect(approvedProcedureUrl(procedure.sourceUrl).href).toBe(procedure.sourceUrl);
    }
    expect(() => approvedProcedureUrl('https://lanl.gov/esm/welding/welding_specs/test.pdf')).toThrow();
    expect(() => approvedProcedureUrl('https://engstandards.lanl.gov/other/test.pdf')).toThrow();
    expect(() => approvedProcedureUrl('http://engstandards.lanl.gov/esm/welding/welding_specs/test.pdf')).toThrow();
  });

  it('never adds source-specific procedures to the calculator registry', () => {
    const procedureIds = new Set(LANL_PROCEDURE_REFERENCES.map((procedure) => procedure.id));
    expect(registry.all.some((record) => procedureIds.has(record.id))).toBe(false);
  });
});