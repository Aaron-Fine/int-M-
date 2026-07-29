export const ICONS = {
  zoomIn:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v8M8 12h8"/><circle cx="12" cy="12" r="9"/></svg>',
  zoomOut:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12h8"/><circle cx="12" cy="12" r="9"/></svg>',
  reset:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M4.8 5.2A9 9 0 1 1 3 15"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  pan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V6a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v7.5A6.5 6.5 0 0 1 11.5 20H10a6 6 0 0 1-5.3-3.2L3 13.5A1.5 1.5 0 0 1 5.7 12L8 15"/></svg>',
  region:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M9 9h6v6H9z"/></svg>',
} as const;

export function setIcon(target: HTMLElement, icon: keyof typeof ICONS, label?: string): void {
  target.innerHTML = `${ICONS[icon]}${label ? `<span>${label}</span>` : ''}`;
}
