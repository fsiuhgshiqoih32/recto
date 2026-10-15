import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';

/** Manual activation keeps arrow navigation from triggering expensive print layouts. */
export function TabBar<T extends string>({ id, label, options, value, onChange, className = 'tabs' }: {
  id: string;
  label: string;
  options: readonly { id: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selected = Math.max(0, options.findIndex((option) => option.id === value));
  // The indicator slides under the selected tab. Tabs are as wide as their labels
  // (translations vary in length), so it is placed from the tab's measured box.
  const [box, setBox] = useState<{ x: number; width: number } | null>(null);
  const labels = options.map((option) => option.label).join('\n');
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const tab = root.querySelectorAll<HTMLElement>('[role="tab"]')[selected];
      if (!tab) return;
      const next = { x: tab.offsetLeft, width: tab.offsetWidth };
      setBox((prev) => (prev && prev.x === next.x && prev.width === next.width ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [selected, labels]);
  const style = {
    '--tab-count': options.length,
    '--tab-index': selected,
    ...(box ? { '--indicator-x': `${box.x}px`, '--indicator-w': `${box.width}px` } : {}),
  } as CSSProperties;
  return (
    <div ref={ref} className={className} role="tablist" aria-label={label} style={style}>
      <span className="tab-indicator" aria-hidden="true" />
      {options.map((option, index) => (
        <button key={option.id} id={`${id}-tab-${option.id}`} type="button" role="tab" aria-selected={value === option.id}
          aria-controls={`${id}-panel-${option.id}`} tabIndex={value === option.id ? 0 : -1} className={value === option.id ? 'is-active' : ''}
          onClick={() => onChange(option.id)} onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const target = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
            ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
          }}>
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
