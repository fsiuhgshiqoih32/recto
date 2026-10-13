import type { Book } from '../../model/book';
import { estimatePages, kdpMinInside } from './pageCss';

/**
 * Lays a book out until its page count settles in one KDP gutter tier. The
 * gutter depends on the page count, which depends on the gutter, so lay out
 * with an estimate and repeat with the real count while the tier keeps
 * changing (at most three passes). `layout` lays out with a page-count hint
 * and resolves to the pages produced.
 */
export async function layoutUntilSettled(
  book: Book,
  layout: (pagesHint: number) => Promise<number>,
): Promise<{ pages: number; passes: number }> {
  let pages = estimatePages(book);
  let passes = 0;
  for (;;) {
    passes++;
    const laidOut = await layout(pages);
    const settled = kdpMinInside(laidOut) === kdpMinInside(pages);
    pages = laidOut;
    if (settled || passes >= 3) return { pages, passes };
  }
}
