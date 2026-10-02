import type { DataQuality } from '../features/welding/types';

export function DataQualityBadge({ quality }: { readonly quality: DataQuality }) {
  return quality === 'verified' ? (
    <span className="badge badge--ok">Verified data</span>
  ) : (
    <span className="badge badge--warn">Sample data — not verified</span>
  );
}
