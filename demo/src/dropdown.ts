/**
 * Close a `details` dropdown (the phone menu, the theme picker) the way menus close: when one of its links is chosen,
 * on Escape (focus goes back to its summary), and when a click or the focus lands outside it. A focus change with no
 * destination (Safari doesn't focus a link or button on click) doesn't close it, or the click would never land.
 */
export function closeOnLeave(details: HTMLDetailsElement): void {
  const close = () => details.removeAttribute('open');
  for (const link of details.querySelectorAll('a')) link.addEventListener('click', close);
  details.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !details.open) return;
    close();
    details.querySelector('summary')?.focus();
  });
  details.addEventListener('focusout', event => {
    const next = event.relatedTarget as Node | null;
    if (next && !details.contains(next)) close();
  });
  document.addEventListener('click', event => {
    if (!details.contains(event.target as Node)) close();
  });
}
