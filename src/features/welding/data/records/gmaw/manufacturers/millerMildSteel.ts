import { defineVerifiedDataset } from '../../../datasets';
import type { GmawRecordSource } from '../../../../types';
import type { VerifiedRecordDraft } from '../../../datasets';

const records: VerifiedRecordDraft<GmawRecordSource>[] = [];

/**
 * TEMPLATE ONLY: this file is not registered until its source metadata is verified.
 * Do not import this file into gmaw/index.ts while these placeholders remain.
 */
export const millerMildSteelDataset =
  defineVerifiedDataset<GmawRecordSource>(
    {
      id: 'miller-mig-solid-cored-weld-setting-calculator-mild-steel',
      process: 'GMAW',
      source: {
        publisher: 'Miller',
        document: 'MIG Solid-Cored Weld Setting Calculator',
        url: 'https://www.millerwelds.com/en-us/resources/weld-setting-calculators/mig-solid-core-welding-calculator',
        accessedDate: '2026-10-02',
      },
      verifiedBy: 'Replace with human verifier after manual source review',
      verifiedDate: 'YYYY-MM-DD',
      interpolationDefault: 'prohibited',
    },
    /*
     * MANUALLY ENTERED RECORDS ONLY.
     * Copy values exactly from the cited manufacturer source and preserve its units.
     * Do not calculate missing values, infer amperage or gas flow, or interpolate between rows.
     * If the source omits an optional value, leave that field undefined.
     * Every entered record must be reviewed before production use.
     * Copilot must NEVER generate, guess, or fill in welding parameter values.
     *
     * Preferred ID pattern:
     * miller-gmaw-mild-steel-<wire>-<thickness>-<sequence>
     *
     * Comment-only record shape; replace placeholders with exact source values:
     * {
     *   id: '<preferred pattern above>',
     *   process: 'GMAW',
     *   material: '<source material>',
     *   thickness: { min: '<source value>', max: '<source value>', unit: '<source unit>' },
     *   joints: '<source applicability>',
     *   positions: '<source applicability>',
     *   wireClass: '<source wire class>',
     *   wireDiameter: { value: '<source value>', unit: '<source unit>' },
     *   gas: '<source shielding gas>',
     *   transferMode: '<source transfer mode>',
     *   polarity: '<source polarity>',
     *   voltage: { min: '<source value>', max: '<source value>' },
     *   wireFeed: { min: '<source value>', max: '<source value>', unit: '<source unit>' },
     *   amperage: { min: '<source value>', max: '<source value>' }, // optional; only if supplied
     *   gasFlow: { min: '<source value>', max: '<source value>', unit: '<source unit>' }, // optional
     *   sourceOverride: { page: '<source page>', tableOrChart: '<source label>' }, // optional
     * }
     * sourceOverride may only change this record's page and/or table/chart provenance.
     */
    records,
  );
