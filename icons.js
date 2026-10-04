const paths={
  frog:'<path d="M4.6 9.2a7.9 7.9 0 0 1 14.8 0 8 8 0 1 1-14.8 0Z"/><circle cx="7.2" cy="6.2" r="2.1"/><circle cx="16.8" cy="6.2" r="2.1"/><circle cx="8.1" cy="12" r=".7" fill="currentColor" stroke="none"/><circle cx="15.9" cy="12" r=".7" fill="currentColor" stroke="none"/><path d="M8.7 15.1c1.9 2 4.7 2 6.6 0"/>',
  sparkle:'<path d="M12 2.5c.8 5.6 2.1 7 9.5 9.5-7.4 2.5-8.7 3.9-9.5 9.5-.8-5.6-2.1-7-9.5-9.5C9.9 9.5 11.2 8.1 12 2.5Z"/>',
  stars:'<path d="M9 2.5c.7 4.1 1.7 5.2 5.5 6.5C10.7 10.3 9.7 11.4 9 15.5 8.3 11.4 7.3 10.3 3.5 9 7.3 7.7 8.3 6.6 9 2.5Z"/><path d="M18 13.5c.5 2.5 1.1 3.1 3.5 3.5-2.4.4-3 1-3.5 3.5-.5-2.5-1.1-3.1-3.5-3.5 2.4-.4 3-1 3.5-3.5Z"/>',
  add:'<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 7v10M7 12h10"/>',
  join:'<path d="M13 4h4a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-4"/><path d="M3 12h12m-4-4 4 4-4 4"/>',
  match:'<circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="16" r="2.5"/><path d="M10.5 8h3a4 4 0 0 1 4 4v1.5M13.5 16h-3a4 4 0 0 1-4-4v-1.5"/>',
  people:'<circle cx="8.5" cy="8" r="2.5"/><path d="M2.7 19v-1.3A4.7 4.7 0 0 1 7.4 13h2.2a4.7 4.7 0 0 1 4.7 4.7V19"/><path d="M15.8 5.6a2.6 2.6 0 0 1 0 5.1M17 13.4a4.7 4.7 0 0 1 4.2 4.7V19"/>',
  arrow:'<path d="M5 19 19 5M9 5h10v10"/>',
  trophy:'<path d="M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H4v3a4 4 0 0 0 4 4m9-7h3v3a4 4 0 0 1-4 4M12 15v4m-4 2h8"/>',
  retry:'<path d="M20 11a8 8 0 1 1-2.7-5.8M20 4v5h-5"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
  music:'<path d="M10 18V5l10-2v13"/><circle cx="6.5" cy="18" r="3.5"/><circle cx="16.5" cy="16" r="3.5"/>',
  topic:'<path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8M8 12h5"/>',
  swords:'<path d="m4 4 16 16M14 4l6 6M4 14l6 6M7 17l-3 3M17 7l3-3"/>',
  note:'<path d="M5 3h11l3 3v15H5V3Z"/><path d="M16 3v4h3M8 11h8M8 15h6"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--nav-knob,#fff)"/><circle cx="15" cy="12" r="2" fill="var(--nav-knob,#fff)"/><circle cx="10" cy="18" r="2" fill="var(--nav-knob,#fff)"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  close:'<path d="M5 5 19 19M19 5 5 19"/>',
  user:'<circle cx="12" cy="8" r="3.5"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'
};
export function iconSvg(name){return `<svg class="sf-icon sf-icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||paths.sparkle}</svg>`;}
export function hydrateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(node=>{node.innerHTML=iconSvg(node.dataset.icon);});}
hydrateIcons();
