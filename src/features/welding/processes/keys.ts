/** Diameters are compared as fixed-precision mm strings to avoid float-equality issues. */
export function diameterKey(mm: number): string {
  return mm.toFixed(3);
}

export function diameterFromKey(key: string): number {
  return Number(key);
}
