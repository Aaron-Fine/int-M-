export const ICONS = {
  zoomIn:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v8M8 12h8"/><circle cx="12" cy="12" r="9"/></svg>',
  zoomOut:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12h8"/><circle cx="12" cy="12" r="9"/></svg>',
  reset:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M4.8 5.2A9 9 0 1 1 3 15"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
} as const;

export function setIcon(target: HTMLElement, icon: keyof typeof ICONS, label?: string): void {
  target.innerHTML = `${ICONS[icon]}${label ? `<span>${label}</span>` : ''}`;
}
