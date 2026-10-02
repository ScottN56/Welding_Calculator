import type { ReactNode } from 'react';

type Tone = 'info' | 'warning' | 'danger' | 'success';

interface NoticeBannerProps {
  readonly tone: Tone;
  readonly title?: string;
  readonly children: ReactNode;
  readonly role?: 'status' | 'alert' | 'note';
}

export function NoticeBanner({ tone, title, children, role = 'note' }: NoticeBannerProps) {
  return (
    <div className={`notice notice--${tone}`} role={role}>
      {title && <strong className="notice__title">{title}</strong>}
      <div className="notice__body">{children}</div>
    </div>
  );
}
