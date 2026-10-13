import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** A viewport-contained menu, including when its trigger is in a scrolling sidebar. */
export function DropdownMenu({ label, children, button, className = 'btn btn-quiet', disabled = false, align = 'left' }: {
  label: string;
  button: ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  disabled?: boolean;
  align?: 'left' | 'right';
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [side, setSide] = useState<'top' | 'bottom'>('bottom');
  // Menus opened from the keyboard appear instantly; pointer opens get a short scale-in from the trigger.
  const [instant, setInstant] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !menu.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const bounds = menu.current.getBoundingClientRect();
      const left = align === 'right' ? anchor.right - bounds.width : anchor.left;
      const above = anchor.bottom + bounds.height + 8 > window.innerHeight;
      const top = above ? anchor.top - bounds.height - 6 : anchor.bottom + 6;
      setSide(above ? 'top' : 'bottom');
      setPosition({ left: Math.max(8, Math.min(left, window.innerWidth - bounds.width - 8)), top: Math.max(8, top) });
    };
    place();
    const observer = new ResizeObserver(place);
    if (menu.current) observer.observe(menu.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, [open, close]);

  const closeAndFocus = () => {
    close();
    trigger.current?.focus();
  };

  return (
    <>
      <button ref={trigger} type="button" className={className} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled}
        onClick={(event) => { setInstant(event.detail === 0); setOpen(!open); }} onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setInstant(true); setOpen(true); }
        }}>
        {button}
      </button>
      {open && createPortal(
        <div ref={menu} id={id} className="menu floating-menu" role="menu" aria-label={label} style={position} data-side={side} data-align={align} data-instant={instant || undefined} onKeyDown={(event) => {
          const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]:not(:disabled)') ?? []);
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const key = event.key;
          if (key === 'Tab') {
            event.stopPropagation();
            const scope = trigger.current?.closest('[aria-modal="true"]') ?? document.body;
            const targets = Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [contenteditable="true"], [tabindex], iframe'))
              .filter((node) => node.tabIndex >= 0 && node.getClientRects().length > 0 && !node.closest('[inert]') && !menu.current?.contains(node));
            const targetIndex = targets.indexOf(trigger.current!);
            const nextIndex = targetIndex + (event.shiftKey ? -1 : 1);
            const next = targets[nextIndex] ?? (scope === document.body ? undefined : targets[(nextIndex + targets.length) % targets.length]);
            if (next) { event.preventDefault(); close(); next.focus(); }
            else closeAndFocus();
            return;
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].includes(key)) {
            event.preventDefault();
            event.stopPropagation();
            if (key === 'Escape') closeAndFocus();
            else if (items.length) items[key === 'Home' ? 0 : key === 'End' ? items.length - 1 : (index + (key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
          }
        }}>
          {children(closeAndFocus)}
        </div>, document.body,
      )}
    </>
  );
}
