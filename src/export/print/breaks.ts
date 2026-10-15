// Widow and orphan control for print. paged.js picks page breaks itself by
// measuring overflow, so the CSS widows/orphans properties never apply. This
// handler runs at each break: when a paragraph is split, it measures the
// paragraph's lines and moves the break so that at least two lines stay at the
// foot of the page and at least two carry over to the next one.
//
// It is plain JavaScript in a string because it runs inside the print
// document, after paged.polyfill.js has defined window.Paged.

export const MIN_LINES = 2;

export const breaksScript = String.raw`
(function () {
  var MIN = ${MIN_LINES};

  // The paragraph-like block (p, li or a verse line group) that holds a node, within this page.
  function blockOf(node, rendered) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    while (el && el !== rendered) {
      if (el.tagName === 'P' || el.tagName === 'LI') return el;
      el = el.parentElement;
    }
    return null;
  }

  // paged.js lays a page out in CSS columns: text that doesn't fit flows into a
  // second column to the right of the page area, not below it.
  function fits(r, bounds) {
    return r.left < bounds.right - 1 && r.bottom <= bounds.bottom + 1;
  }

  function lineBoxes(rects) {
    rects.sort(function (a, b) { return a.left - b.left > 50 ? 1 : b.left - a.left > 50 ? -1 : a.top - b.top; });
    var out = [];
    rects.forEach(function (r) {
      var last = out[out.length - 1];
      // Rectangles on one line overlap vertically (small caps and italics sit a little higher or lower).
      if (last && Math.abs(r.left - last.left) < 50 + r.width + last.width && r.top < last.bottom - Math.min(r.height, last.bottom - last.top) / 2 && r.bottom > last.top) {
        last.bottom = Math.max(last.bottom, r.bottom);
      } else {
        out.push({ top: r.top, bottom: r.bottom, left: r.left, width: r.width });
      }
    });
    return out;
  }

  // The block's lines that fit on this page, and the lines that overflow it. A
  // drop cap is a float spanning several lines, so its letter doesn't count.
  function lines(block, bounds) {
    var kept = [];
    var moved = [];
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    var range = document.createRange();
    for (var node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement && node.parentElement.closest('.dropcap')) continue;
      range.selectNodeContents(node);
      Array.prototype.forEach.call(range.getClientRects(), function (r) {
        if (r.width > 0 && r.height > 0) (fits(r, bounds) ? kept : moved).push(r);
      });
    }
    return { kept: lineBoxes(kept), moved: lineBoxes(moved) };
  }

  // The text position where a line on this page starts: its first character.
  function lineStart(block, line, bounds) {
    var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    var range = document.createRange();
    for (var node = walker.nextNode(); node; node = walker.nextNode()) {
      for (var i = 0; i < node.length; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        var rect = range.getBoundingClientRect();
        if (rect.height > 0 && fits(rect, bounds) && rect.top >= line.top - 1 && rect.bottom > line.top + 1) return { node: node, offset: i };
      }
    }
    return null;
  }

  // Is there content on this page before the block (so the block can move to the next page)?
  function hasContentBefore(block, rendered) {
    var range = document.createRange();
    range.setStart(rendered, 0);
    range.setEndBefore(block);
    return range.toString().trim().length > 0 || range.cloneContents().querySelector('img, svg, hr') !== null;
  }

  class RectoBreaks extends Paged.Handler {
    onOverflow(overflow, rendered, bounds) {
      if (!overflow) return;
      var block = blockOf(overflow.startContainer, rendered);
      if (!block) return;
      // Only breaks that fall inside the block's text split it.
      var before = document.createRange();
      before.setStart(block, 0);
      before.setEnd(overflow.startContainer, overflow.startOffset);
      if (!before.toString().trim()) return;

      var split = lines(block, bounds);
      var kept = split.kept.length;
      var moved = split.moved.length;
      if (!moved || (kept >= MIN && moved >= MIN)) return;

      var fixed = document.createRange();
      if (moved < MIN && kept > MIN) {
        // Widow: carry one more line over.
        var start = lineStart(block, split.kept[kept - (MIN - moved)], bounds);
        if (!start) return;
        fixed.setStart(start.node, start.offset);
      } else if (hasContentBefore(block, rendered)) {
        // Orphan, or too short to split both ways: the whole paragraph moves.
        fixed.setStartBefore(block);
      } else {
        return;
      }
      fixed.setEndAfter(rendered.lastChild);
      return fixed;
    }
  }
  Paged.registerHandlers(RectoBreaks);
})();
`;
