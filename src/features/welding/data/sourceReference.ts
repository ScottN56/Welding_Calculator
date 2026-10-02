import type { SourceReference } from '../types';

/** Copies source metadata without changing its values or units. */
export function createSourceReference(source: SourceReference): SourceReference {
  return { ...source };
}