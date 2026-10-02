export type TabId = 'calculator' | 'saved' | 'reference' | 'settings';

const TABS: readonly { id: TabId; label: string; icon: string }[] = [
  { id: 'calculator', label: 'Calculator', icon: 'M4 3h16v18H4zM7 6h10v4H7zM7 13h2v2H7zm4 0h2v2h-2zm4 0h2v5h-2zM7 17h2v2H7zm4 0h2v2h-2z' },
  { id: 'saved', label: 'Saved', icon: 'M6 3h12v18l-6-4-6 4z' },
  { id: 'reference', label: 'Reference', icon: 'M4 4h7v16H4zm9 0h7v16h-7zM6 7h3M6 10h3m6-3h3m-3 3h3' },
  { id: 'settings', label: 'Settings', icon: 'M12 8a4 4 0 100 8 4 4 0 000-8zm8 4l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L7 7.5 5 7 4 10l2 1v2l-2 1 1 3 2-.5 1.5 1.5-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z' },
];

interface BottomNavProps {
  readonly active: TabId;
  readonly onChange: (tab: TabId) => void;
  readonly savedCount: number;
}

export function BottomNav({ active, onChange, savedCount }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="bottom-nav__item"
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="bottom-nav__icon">
            <path d={tab.icon} />
          </svg>
          <span>
            {tab.label}
            {tab.id === 'saved' && savedCount > 0 && <span className="bottom-nav__count"> ({savedCount})</span>}
          </span>
        </button>
      ))}
    </nav>
  );
}
