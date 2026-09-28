// Minimal line-icon set (stroke-based, 20x20 viewBox), inspired by Feather icons.
// Usage: ICONS.edit() returns an SVG markup string sized via CSS (width/height: 1em by default).
const ICONS = {
  check: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5l4.5 4.5L17 5"/></svg>`,
  edit: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z"/></svg>`,
  trash: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12M8 6V4h4v2m-7 0v10a1 1 0 001 1h6a1 1 0 001-1V6"/></svg>`,
  file: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h6l3 3v11a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M12 3v3h3"/></svg>`,
  moon: () => `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M15.5 12.5A6.5 6.5 0 018 5a6.5 6.5 0 106.7 8.1c.3 0 .5-.4.3-.6-.5.1-1 .1-1.5 0z"/></svg>`,
  sun: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10" cy="10" r="3.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/></svg>`,
  search: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M17 17l-3.8-3.8"/></svg>`,
  taskArrow: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="9" height="9" rx="1.5"/><path d="M6 8.3l1.6 1.6L9.5 6.5"/><path d="M13 9h5m0 0l-2-2m2 2l-2 2"/></svg>`,
  plus: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 4v12M4 10h12"/></svg>`,
  close: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>`,
  chevron: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4l6 6-6 6"/></svg>`,
  pin: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h2l.5 5.5L14 10v2H6v-2l2.5-1.5z"/><path d="M10 12v5"/></svg>`,
  expand: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3H3v4M13 3h4v4M7 17H3v-4M13 17h4v-4"/></svg>`,
  repeat: () => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V7a3 3 0 013-3h8m0 0l-2.5-2.5M15 4l-2.5 2.5"/><path d="M16 11v2a3 3 0 01-3 3H5m0 0l2.5 2.5M5 16l2.5-2.5"/></svg>`,
};

function iconEl(name, extraClass) {
  const span = document.createElement("span");
  span.className = "icon" + (extraClass ? " " + extraClass : "");
  span.innerHTML = ICONS[name]();
  return span;
}
