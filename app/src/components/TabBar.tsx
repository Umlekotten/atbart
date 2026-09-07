export type Tab = "ikvall" | "veckan" | "recept" | "jag";

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  {
    id: "ikvall",
    label: "I kväll",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />
      </svg>
    ),
  },
  {
    id: "veckan",
    label: "Veckan",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    id: "recept",
    label: "Recept",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 0-3 3z" />
        <path d="M5 4.5V20a3 3 0 0 1 3 3h9" />
        <path d="M9 9h5M9 12.5h5" />
      </svg>
    ),
  },
  {
    id: "jag",
    label: "Jag",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    ),
  },
];

export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Huvudmeny">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tab${active === t.id ? " tab-active" : ""}`}
          onClick={() => onChange(t.id)}
          aria-current={active === t.id ? "page" : undefined}
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
