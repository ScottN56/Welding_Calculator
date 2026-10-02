import type { WeldingProcess } from '../types';
import { approvedProcedureUrl } from './procedureSources';

export interface ProcedureReference {
  readonly id: string;
  readonly classification: 'procedure-reference';
  readonly process: WeldingProcess;
  readonly procedureNumber: string;
  readonly title: string;
  readonly revision: string;
  readonly sourceUrl: string;
  readonly scope: readonly string[];
  readonly useRequirements: readonly string[];
}

export const LANL_PROCEDURE_REFERENCES: readonly ProcedureReference[] = [
  {
    id: 'lanl-fcaw-3501-11b',
    classification: 'procedure-reference',
    process: 'FCAW',
    procedureNumber: '3501-11B',
    title: 'Welding Procedure Specification',
    revision: 'Revision 0, 2004-10-12',
    sourceUrl: 'https://engstandards.lanl.gov/esm/welding/welding_specs/3501-11B.pdf',
    scope: [
      'Base materials: steel and steel alloys, as stated on the WPS.',
      'FCAW with CO2 shielding; the WPS lists E-1xxT-1 wire.',
      'The WPS defers joint details and fabrication criteria to LANL GWS 1-06 and the Welding Fabrication Procedures.',
    ],
    useRequirements: [
      'Use with the referenced LANL General Welding Standards and Welding Fabrication Procedures; this PDF alone is not a complete job procedure.',
      'The WPS requires independent review for specified work categories and states that non-LANL use is at the subcontractor’s risk.',
    ],
  },
  {
    id: 'lanl-smaw-1000-4140',
    classification: 'procedure-reference',
    process: 'SMAW',
    procedureNumber: '1000-4140',
    title: 'Welding Procedure Specification',
    revision: 'Revision 0, 2004-09-01',
    sourceUrl: 'https://engstandards.lanl.gov/esm/welding/welding_specs/1000-4140.pdf',
    scope: [
      'Base material: AISI 4140.',
      'Butt and fillet joints; thickness 1/8–3/4 in as listed on the WPS.',
      'Electrode: E9018. The procedure lists DCEP and an all-position qualification.',
    ],
    useRequirements: [
      'Use with the referenced LANL General Welding Standards and Welding Fabrication Procedures.',
      'The WPS requires independent review for specified work categories.',
    ],
  },
  {
    id: 'lanl-gtaw-2010-xxxx-8-f00',
    classification: 'procedure-reference',
    process: 'GTAW',
    procedureNumber: '2010-XXXX-8-F00',
    title: 'Welding Procedure Specification',
    revision: 'Revision 0, 2015-01-28',
    sourceUrl: 'https://engstandards.lanl.gov/esm/welding/welding_specs/2010-xxxx-8-F00-R0.pdf',
    scope: [
      'Base material: ASME P-No. 8 stainless steel; the WPS names pipe, plate, sheet, and shapes.',
      'ASME qualified thickness range: 0.02–0.22 in; qualified positions: all, with vertical progression up or down.',
      'Autogenous GTAW: no filler metal. The WPS specifies DCEN and argon shielding/backing gas.',
    ],
    useRequirements: [
      'LANL authorization and a job-specific Welding Technique Sheet are required by the WPS.',
      'Use with the referenced LANL General Welding Standards and Welding Fabrication Procedures; the WPS states that non-LANL use is at the subcontractor’s risk.',
    ],
  },
];

for (const procedure of LANL_PROCEDURE_REFERENCES) approvedProcedureUrl(procedure.sourceUrl);