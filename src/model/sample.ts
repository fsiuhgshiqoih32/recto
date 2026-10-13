// "The Lamp at Harrow Point": an original sample novella written for Recto
// and dedicated to the public domain (CC0). Used for the demo and the tests.

import type { BlockNode, Book, BookElement, Doc, InlineNode, Mark } from './book';
import { createElement, newBook } from './defaults';

/** Tiny inline syntax for the sample text: *italic*, **bold**, ^^small caps^^. */
function inline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\^\^(.+?)\^\^/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) nodes.push({ type: 'text', text: text.slice(last, m.index) });
    const mark: Mark['type'] = m[1] ? 'bold' : m[2] ? 'italic' : 'smallCaps';
    nodes.push({ type: 'text', text: m[1] ?? m[2] ?? m[3], marks: [{ type: mark }] });
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  return nodes;
}

/** One block per entry: "***" is a scene break, "> " a block quote, "=" centers. */
function doc(...entries: string[]): Doc {
  const content: BlockNode[] = entries.map((entry): BlockNode => {
    if (entry === '***') return { type: 'sceneBreak' };
    if (entry.startsWith('> ')) {
      return {
        type: 'blockquote',
        content: entry
          .slice(2)
          .split(' / ')
          .map((line) => ({ type: 'paragraph', content: inline(line) })),
      };
    }
    if (entry.startsWith('= ')) return { type: 'paragraph', attrs: { textAlign: 'center' }, content: inline(entry.slice(2)) };
    if (entry.startsWith('>= ')) return { type: 'paragraph', attrs: { textAlign: 'right' }, content: inline(entry.slice(3)) };
    return { type: 'paragraph', content: inline(entry) };
  });
  return { type: 'doc', content };
}

export function sampleBook(): Book {
  const book = newBook({
    title: 'The Lamp at Harrow Point',
    subtitle: 'A Recto Sample Novella',
    author: 'Mara Quill',
    publisher: 'Recto Sample Press',
    description: 'A lighthouse keeper inherits a ledger that counts more than candles.',
  });
  const meta = book.meta;
  const chapter = (title: string, content: Doc, extra: Partial<BookElement> = {}) =>
    createElement('chapter', meta, { title, content, ...extra });

  book.elements = [
    createElement('title-page'),
    createElement('copyright', meta),
    createElement('dedication', meta, { content: doc('*For everyone who has ever kept a list nobody asked for.*') }),
    createElement('epigraph', meta, {
      content: doc(
        '“Wick trimmed. Glass cleaned. Oil, eleven gallons. Nothing else to report, which is the whole of the job.”',
        '>= — The Harrow Point log, 1887',
      ),
    }),
    createElement('toc'),
    chapter(
      'Prologue',
      doc(
        'The first keeper of the Harrow Point light left behind three things: a brass key, a cracked barometer, and a ledger bound in green cloth that nobody had thought to read for ninety years.',
        'The key opened nothing anyone could find. The barometer had been reading *Change* since the winter of 1931, and the town had long ago stopped taking it personally. The ledger sat on the lowest shelf of the watch room between a tide table and a tin of matches, where it had been put down by someone who meant to come back for it.',
        'It was, everyone agreed, the most boring book in the county. Page after page of oil and wick and weather. The kind of book that is only ever opened by accident, or by someone with nothing else to do.',
        'Which is how Ada Fenn came to open it, on her first night alone with the lamp.',
      ),
      { numbered: false },
    ),
    createElement('part', meta, { title: 'The Ledger' }),
    chapter(
      'The Inventory',
      doc(
        'The lamp was lit at a quarter past five, which the ledger would have called *early* and Ada called *dark*. She climbed the hundred and eight steps with a thermos in one hand and the green book under her arm, and she did not look out of the windows until she had checked every brass fitting twice.',
        'The Harbor Commission had been very clear about the checking. There was a laminated card about it, screwed to the wall beside the door. ^^Inspect. Record. Report.^^ Someone had added, in pencil, *Repeat*.',
        'She sat down at the small desk under the lamp room, opened the ledger to a clean page near the back, and found that there were no clean pages. Every line had been used. The last entry, in a hand that leaned hard to the right, read simply:',
        '> ^^Oct. 12.^^ Wind NNE, moderate. Oil, nine gallons. Glass cleaned. / Somebody should continue this.',
        'Ada read it three times. Then she went down to the storeroom, found a fresh notebook in a box of fresh notebooks that the Commission had sent in 1974 and never been thanked for, and carried it back up the stairs.',
        'She wrote the date. She wrote the wind. She went outside onto the gallery and counted the gulls on the breakwater, because the old ledger had counted gulls, and it seemed rude to stop.',
        '***',
        'By the end of the first week she had learned the rhythm of the place. The lamp did not need her, exactly; it was electric now, and it turned on a timer, and a small grey box in the basement reported its health to an office two hundred miles inland. But the ledger needed her. That was the part nobody had mentioned at the interview.',
        'She kept it the way the old keepers had. Wind. Weather. Oil, though there was no oil, so she wrote *none* and felt faintly guilty about it each night. Ships seen. Gulls. Visitors, of whom there were none, until the Thursday when there was one.',
        '“You’re the new one,” said the woman at the door. She was perhaps seventy, in a yellow coat, holding a cake tin. “I’m Bea. I used to bring the last one biscuits. He never ate them but he liked to be asked.”',
        '“I’ll eat them,” said Ada.',
        '“Good,” said Bea, and came in without being invited, which Ada would later write down in the ledger under *Visitors* as the most important event of the month.',
      ),
    ),
    chapter(
      'Fog Season',
      doc(
        '“The fog comes in October,” Bea said, “and it doesn’t ask.”',
        'She was right. It arrived on the sixteenth like a tenant with a long lease, and it did not leave. The breakwater vanished, then the harbor, then the end of the gallery railing, until Ada stood at the top of the tower in a room made of white and could not see her own hand when she held it out to check.',
        'The foghorn was automatic too. It sounded every thirty seconds, a long low note that Ada felt in her teeth. She wrote it down. ^^Fog, dense. Horn, operating.^^ She found she liked writing it down. It made the fog into something that had been noted, and a thing that has been noted is a thing that can be survived.',
        'On the third night of fog she went back to the old ledger, not for any reason, and started reading from the very beginning.',
        'The first keeper had been a man named Josiah Pell. He wrote small and he wrote everything. Oil and wick, yes, but also: *Bread from the Marsh house, very good.* And: *Child on the breakwater at dusk, sent home.* And once, in the spring of 1889, only: *Could not sleep. Counted the stairs. Still one hundred and eight.*',
        'Ada laughed out loud, alone in the tower, and the fog swallowed the sound.',
        '***',
        'She began to notice the pattern on the fifth night.',
        'It was in the margins. Every few pages, beside an ordinary entry, Josiah had made a tiny mark: a dot inside a circle, no larger than a lentil. At first she took it for a blot. Then she found another, and another, and she went downstairs for a pencil and a fresh page and began to list the dates.',
        'There were forty-one of them across eleven years. None of the entries they marked said anything unusual. *Wind SW. Oil, ten gallons. Glass cleaned.* Ordinary days, the most ordinary in the book.',
        'She read the list until the horn had sounded a hundred times, and then she put the pencil down, and said to the white window, “Well, what are you, then?”',
        'The fog, as was its habit, did not answer.',
      ),
    ),
    createElement('part', meta, { title: 'The Light' }),
    chapter(
      'What the Ledger Knew',
      doc(
        'Bea knew about the circles. Of course she did.',
        '“My grandmother told me,” she said, cutting a lemon cake into eight exact pieces on the watch-room desk. “Josiah marked the nights when a boat came home that shouldn’t have. Lost in the fog, or the storm, or just lost. And then there it was, coming round the point, following the light.”',
        '“Forty-one boats,” said Ada.',
        '“Forty-one nights. Some nights it was more than one boat.” Bea slid a slice across. “He never wrote the names. He said it wasn’t his business who came home. Only that they did.”',
        'Ada looked at the old ledger for a long time. Then she looked at her own notebook, with its gulls and its *none* and its careful ^^Horn, operating^^, and she understood that she had been keeping the same book all along and had simply not known what it was for.',
        '***',
        'The fog lifted on the last day of October, all at once, the way a stage curtain goes up. The breakwater came back, then the harbor, then the long grey line of the sea. And there on the horizon, small and late and very much afloat, was a fishing boat that the harbor radio had been calling for since noon.',
        'Ada watched it round the point. She watched it until it was safe inside the wall and its lights went out one by one along the quay.',
        'Then she sat down at the desk, opened her notebook, and wrote the date and the wind and the weather. *Oil, none. Glass cleaned. Gulls, thirty-two.* And in the margin, very small, she drew a dot inside a circle.',
        'Nobody would ever read it, probably. That was fine. That was, she was beginning to think, the whole of the job.',
      ),
    ),
    chapter(
      'Epilogue',
      doc(
        'The Harbor Commission sends a new box of notebooks every few years. Nobody has asked them to. Nobody has told them to stop.',
        'If you visit Harrow Point on a clear evening, the light will come on at a quarter past five by the timer, and a woman in a yellow coat may offer you cake. Say yes. It will be written down.',
      ),
      { numbered: false },
    ),
    createElement('acknowledgments', meta, {
      content: doc(
        'This story was written to give Recto something to typeset. Thanks to every keeper of every log that nobody reads, and to the people who build tools so that authors can spend their time writing instead of adjusting margins.',
      ),
    }),
    createElement('about-author', meta, {
      content: doc(
        '**Mara Quill** is not a real person. She lives in the sample folder of an open-source book formatter, where she writes quiet stories about lists, weather and the people who keep them. This is her first book.',
      ),
    }),
    createElement('also-by', meta, {
      title: 'Also by Mara Quill',
      content: doc('= *The Tide Tables*', '= *A Short History of Wicks*', '= *Gulls, Counted*'),
    }),
  ];
  return book;
}
