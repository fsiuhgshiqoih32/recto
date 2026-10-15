import { type RefObject, useEffect } from 'react';

/** Opens a <dialog> as a modal once it mounts. */
export function useModal(ref: RefObject<HTMLDialogElement | null>): void {
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [ref]);
}
