import { type RefObject, useEffect, useState } from 'react';

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setMatches(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [query]);
  return matches;
}

/** Preserve each panel's DOM while making its compact layout a modal drawer. */
export function useDrawer(ref: RefObject<HTMLElement>, open: boolean, close: () => void) {
  useEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const workspace = panel.parentElement!;
    const background = [...Array.from(workspace.children), ...Array.from(workspace.parentElement!.children)]
      .filter((node) => node !== panel && node !== workspace && !node.classList.contains('drawer-backdrop'));
    const previouslyInert = background.map((node) => node.hasAttribute('inert'));
    background.forEach((node) => node.setAttribute('inert', ''));
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([type="hidden"]), select, textarea, [tabindex="0"], iframe'))
      .filter((node) => node.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      // Portaled menus handle their own keyboard navigation before this listener.
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const nodes = focusable();
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      background.forEach((node, index) => { if (!previouslyInert[index]) node.removeAttribute('inert'); });
      if (previousFocus?.isConnected && previousFocus.getClientRects().length > 0) previousFocus.focus();
      else workspace.parentElement?.querySelector<HTMLElement>('[aria-label="Workspace view"] [aria-selected="true"]')?.focus();
    };
  }, [ref, open, close]);
}
