export interface TroubleshootingTip {
  readonly id: string;
  readonly symptom: string;
  /** Settings or conditions to investigate, most likely first. Never applied automatically. */
  readonly investigate: readonly string[];
}

export interface TroubleshootingGuide {
  readonly tips: readonly TroubleshootingTip[];
  /** False until reviewed against a verified source by a qualified person. */
  readonly reviewed: boolean;
  readonly sourceNote: string;
}
