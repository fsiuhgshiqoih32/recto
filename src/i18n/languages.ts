// Languages: script, direction and the words Recto writes into a book.
// Any BCP 47 code works. Languages listed here get localized headings and
// labels; anything else falls back to Intl for its name, script and direction.

export type ScriptGroup =
  | 'latin'
  | 'cyrillic'
  | 'greek'
  | 'arabic'
  | 'hebrew'
  | 'han-simplified'
  | 'han-traditional'
  | 'japanese'
  | 'korean'
  | 'devanagari'
  | 'thai'
  | 'other';

/** Words Recto writes into the book itself (headings, labels, navigation). */
export interface BookStrings {
  /** "Chapter {n}": the label template; `{n}` is the localized number. */
  chapter: string;
  part: string;
  contents: string;
  titlePage: string;
  copyright: string;
  dedication: string;
  epigraph: string;
  acknowledgments: string;
  aboutAuthor: string;
  alsoBy: string;
  cover: string;
  beginReading: string;
  allRightsReserved: string;
  ebook: string;
  paperback: string;
  prologue: string;
  epilogue: string;
  /** Heading for endnotes. */
  notes: string;
  /** "Book {n}": the label of a volume in a box set. */
  volume: string;
}

export interface Language {
  code: string;
  /** English name, for the picker. */
  name: string;
  /** Name in the language itself. */
  native: string;
  script: ScriptGroup;
  dir: 'ltr' | 'rtl';
  /** Localized book words; undefined for languages Recto has no translations for. */
  strings?: BookStrings;
}

const S = (
  chapter: string, part: string, contents: string, titlePage: string, copyright: string, dedication: string,
  epigraph: string, acknowledgments: string, aboutAuthor: string, alsoBy: string, cover: string,
  beginReading: string, allRightsReserved: string, ebook: string, paperback: string, prologue: string, epilogue: string,
): Omit<BookStrings, 'notes' | 'volume'> => ({
  chapter, part, contents, titlePage, copyright, dedication, epigraph, acknowledgments, aboutAuthor, alsoBy,
  cover, beginReading, allRightsReserved, ebook, paperback, prologue, epilogue,
});

type Entry = [code: string, name: string, native: string, script: ScriptGroup, strings: Omit<BookStrings, 'notes' | 'volume'>];

/** The heading for endnotes in each language. */
const NOTES: Record<string, string> = {
  en: 'Notes', es: 'Notas', fr: 'Notes', de: 'Anmerkungen', it: 'Note', pt: 'Notas', nl: 'Noten', sv: 'Noter', da: 'Noter',
  nb: 'Noter', fi: 'Viitteet', pl: 'Przypisy', cs: 'Poznámky', ro: 'Note', hu: 'Jegyzetek', tr: 'Notlar', vi: 'Chú thích',
  id: 'Catatan', ru: 'Примечания', uk: 'Примітки', el: 'Σημειώσεις', ar: 'الحواشي', fa: 'یادداشت‌ها', he: 'הערות',
  hi: 'टिप्पणियाँ', th: 'เชิงอรรถ', 'zh-Hans': '注释', 'zh-Hant': '註釋', ja: '注', ko: '주',
};

/** The label of a volume in a box set ("Book One") in each language. */
const VOLUME: Record<string, string> = {
  en: 'Book {n}', es: 'Libro {n}', fr: 'Livre {n}', de: 'Band {n}', it: 'Libro {n}', pt: 'Livro {n}', nl: 'Boek {n}', sv: 'Bok {n}',
  da: 'Bog {n}', nb: 'Bok {n}', fi: '{n}. kirja', pl: 'Tom {n}', cs: 'Svazek {n}', ro: 'Volumul {n}', hu: '{n}. kötet', tr: '{n}. Kitap',
  vi: 'Tập {n}', id: 'Buku {n}', ru: 'Книга {n}', uk: 'Книга {n}', el: 'Βιβλίο {n}', ar: 'الكتاب {n}', fa: 'کتاب {n}', he: 'ספר {n}',
  hi: 'पुस्तक {n}', th: 'เล่ม {n}', 'zh-Hans': '第{n}册', 'zh-Hant': '第{n}冊', ja: '第{n}巻', ko: '제{n}권',
};

const ENTRIES: Entry[] = [
  ['en', 'English', 'English', 'latin', S('Chapter {n}', 'Part {n}', 'Contents', 'Title Page', 'Copyright', 'Dedication', 'Epigraph', 'Acknowledgments', 'About the Author', 'Also By', 'Cover', 'Begin Reading', 'All rights reserved.', 'ebook', 'paperback', 'Prologue', 'Epilogue')],
  ['es', 'Spanish', 'Español', 'latin', S('Capítulo {n}', 'Parte {n}', 'Índice', 'Página de título', 'Derechos de autor', 'Dedicatoria', 'Epígrafe', 'Agradecimientos', 'Sobre el autor', 'Otras obras', 'Cubierta', 'Comenzar a leer', 'Todos los derechos reservados.', 'libro electrónico', 'tapa blanda', 'Prólogo', 'Epílogo')],
  ['fr', 'French', 'Français', 'latin', S('Chapitre {n}', 'Partie {n}', 'Table des matières', 'Page de titre', 'Droits d’auteur', 'Dédicace', 'Épigraphe', 'Remerciements', 'À propos de l’auteur', 'Du même auteur', 'Couverture', 'Commencer la lecture', 'Tous droits réservés.', 'livre numérique', 'broché', 'Prologue', 'Épilogue')],
  ['de', 'German', 'Deutsch', 'latin', S('Kapitel {n}', 'Teil {n}', 'Inhalt', 'Titelseite', 'Impressum', 'Widmung', 'Motto', 'Danksagung', 'Über den Autor', 'Weitere Bücher', 'Cover', 'Lesen beginnen', 'Alle Rechte vorbehalten.', 'E-Book', 'Taschenbuch', 'Prolog', 'Epilog')],
  ['it', 'Italian', 'Italiano', 'latin', S('Capitolo {n}', 'Parte {n}', 'Indice', 'Frontespizio', 'Copyright', 'Dedica', 'Epigrafe', 'Ringraziamenti', 'Sull’autore', 'Dello stesso autore', 'Copertina', 'Inizia a leggere', 'Tutti i diritti riservati.', 'ebook', 'brossura', 'Prologo', 'Epilogo')],
  ['pt', 'Portuguese', 'Português', 'latin', S('Capítulo {n}', 'Parte {n}', 'Sumário', 'Folha de rosto', 'Direitos autorais', 'Dedicatória', 'Epígrafe', 'Agradecimentos', 'Sobre o autor', 'Do mesmo autor', 'Capa', 'Começar a ler', 'Todos os direitos reservados.', 'e-book', 'brochura', 'Prólogo', 'Epílogo')],
  ['nl', 'Dutch', 'Nederlands', 'latin', S('Hoofdstuk {n}', 'Deel {n}', 'Inhoud', 'Titelpagina', 'Colofon', 'Opdracht', 'Motto', 'Dankwoord', 'Over de auteur', 'Van dezelfde auteur', 'Omslag', 'Begin met lezen', 'Alle rechten voorbehouden.', 'e-book', 'paperback', 'Proloog', 'Epiloog')],
  ['sv', 'Swedish', 'Svenska', 'latin', S('Kapitel {n}', 'Del {n}', 'Innehåll', 'Titelsida', 'Upphovsrätt', 'Dedikation', 'Motto', 'Tack', 'Om författaren', 'Av samma författare', 'Omslag', 'Börja läsa', 'Alla rättigheter förbehållna.', 'e-bok', 'pocket', 'Prolog', 'Epilog')],
  ['da', 'Danish', 'Dansk', 'latin', S('Kapitel {n}', 'Del {n}', 'Indhold', 'Titelblad', 'Ophavsret', 'Dedikation', 'Motto', 'Tak', 'Om forfatteren', 'Af samme forfatter', 'Omslag', 'Begynd at læse', 'Alle rettigheder forbeholdes.', 'e-bog', 'paperback', 'Prolog', 'Epilog')],
  ['nb', 'Norwegian', 'Norsk bokmål', 'latin', S('Kapittel {n}', 'Del {n}', 'Innhold', 'Tittelside', 'Opphavsrett', 'Dedikasjon', 'Motto', 'Takk', 'Om forfatteren', 'Av samme forfatter', 'Omslag', 'Begynn å lese', 'Alle rettigheter forbeholdt.', 'e-bok', 'pocket', 'Prolog', 'Epilog')],
  ['fi', 'Finnish', 'Suomi', 'latin', S('{n}. luku', '{n}. osa', 'Sisällys', 'Nimiösivu', 'Tekijänoikeudet', 'Omistus', 'Motto', 'Kiitokset', 'Kirjailijasta', 'Samalta kirjailijalta', 'Kansi', 'Aloita lukeminen', 'Kaikki oikeudet pidätetään.', 'e-kirja', 'nidottu', 'Prologi', 'Epilogi')],
  ['pl', 'Polish', 'Polski', 'latin', S('Rozdział {n}', 'Część {n}', 'Spis treści', 'Strona tytułowa', 'Prawa autorskie', 'Dedykacja', 'Motto', 'Podziękowania', 'O autorze', 'Tego samego autora', 'Okładka', 'Zacznij czytać', 'Wszelkie prawa zastrzeżone.', 'e-book', 'miękka oprawa', 'Prolog', 'Epilog')],
  ['cs', 'Czech', 'Čeština', 'latin', S('Kapitola {n}', 'Část {n}', 'Obsah', 'Titulní strana', 'Autorská práva', 'Věnování', 'Motto', 'Poděkování', 'O autorovi', 'Od stejného autora', 'Obálka', 'Začít číst', 'Všechna práva vyhrazena.', 'e-kniha', 'brožovaná vazba', 'Prolog', 'Epilog')],
  ['ro', 'Romanian', 'Română', 'latin', S('Capitolul {n}', 'Partea {n}', 'Cuprins', 'Pagina de titlu', 'Drepturi de autor', 'Dedicație', 'Motto', 'Mulțumiri', 'Despre autor', 'De același autor', 'Copertă', 'Începe lectura', 'Toate drepturile rezervate.', 'carte electronică', 'broșată', 'Prolog', 'Epilog')],
  ['hu', 'Hungarian', 'Magyar', 'latin', S('{n}. fejezet', '{n}. rész', 'Tartalom', 'Címoldal', 'Szerzői jog', 'Ajánlás', 'Mottó', 'Köszönetnyilvánítás', 'A szerzőről', 'A szerző további művei', 'Borító', 'Olvasás kezdése', 'Minden jog fenntartva.', 'e-könyv', 'puhatáblás', 'Prológus', 'Epilógus')],
  ['tr', 'Turkish', 'Türkçe', 'latin', S('{n}. Bölüm', '{n}. Kısım', 'İçindekiler', 'Başlık sayfası', 'Telif hakkı', 'İthaf', 'Epigraf', 'Teşekkür', 'Yazar hakkında', 'Yazarın diğer kitapları', 'Kapak', 'Okumaya başla', 'Tüm hakları saklıdır.', 'e-kitap', 'karton kapak', 'Prolog', 'Epilog')],
  ['vi', 'Vietnamese', 'Tiếng Việt', 'latin', S('Chương {n}', 'Phần {n}', 'Mục lục', 'Trang tên sách', 'Bản quyền', 'Lời đề tặng', 'Đề từ', 'Lời cảm ơn', 'Về tác giả', 'Tác phẩm khác của tác giả', 'Bìa', 'Bắt đầu đọc', 'Bảo lưu mọi quyền.', 'sách điện tử', 'bìa mềm', 'Lời mở đầu', 'Lời kết')],
  ['id', 'Indonesian', 'Bahasa Indonesia', 'latin', S('Bab {n}', 'Bagian {n}', 'Daftar Isi', 'Halaman Judul', 'Hak Cipta', 'Persembahan', 'Epigraf', 'Ucapan Terima Kasih', 'Tentang Penulis', 'Karya Lain Penulis', 'Sampul', 'Mulai Membaca', 'Hak cipta dilindungi undang-undang.', 'buku elektronik', 'sampul lunak', 'Prolog', 'Epilog')],
  ['ru', 'Russian', 'Русский', 'cyrillic', S('Глава {n}', 'Часть {n}', 'Содержание', 'Титульный лист', 'Авторские права', 'Посвящение', 'Эпиграф', 'Благодарности', 'Об авторе', 'Другие книги автора', 'Обложка', 'Начать чтение', 'Все права защищены.', 'электронная книга', 'мягкая обложка', 'Пролог', 'Эпилог')],
  ['uk', 'Ukrainian', 'Українська', 'cyrillic', S('Розділ {n}', 'Частина {n}', 'Зміст', 'Титульна сторінка', 'Авторські права', 'Присвята', 'Епіграф', 'Подяки', 'Про автора', 'Інші книжки автора', 'Обкладинка', 'Почати читання', 'Усі права захищено.', 'електронна книжка', 'м’яка обкладинка', 'Пролог', 'Епілог')],
  ['el', 'Greek', 'Ελληνικά', 'greek', S('Κεφάλαιο {n}', 'Μέρος {n}', 'Περιεχόμενα', 'Σελίδα τίτλου', 'Πνευματικά δικαιώματα', 'Αφιέρωση', 'Μότο', 'Ευχαριστίες', 'Για τον συγγραφέα', 'Του ίδιου συγγραφέα', 'Εξώφυλλο', 'Έναρξη ανάγνωσης', 'Με επιφύλαξη παντός δικαιώματος.', 'ηλεκτρονικό βιβλίο', 'χαρτόδετο', 'Πρόλογος', 'Επίλογος')],
  ['ar', 'Arabic', 'العربية', 'arabic', S('الفصل {n}', 'الجزء {n}', 'المحتويات', 'صفحة العنوان', 'حقوق النشر', 'إهداء', 'تصدير', 'شكر وتقدير', 'عن المؤلف', 'للمؤلف أيضًا', 'الغلاف', 'ابدأ القراءة', 'جميع الحقوق محفوظة.', 'كتاب إلكتروني', 'غلاف ورقي', 'تمهيد', 'خاتمة')],
  ['fa', 'Persian', 'فارسی', 'arabic', S('فصل {n}', 'بخش {n}', 'فهرست', 'صفحهٔ عنوان', 'حق نشر', 'تقدیم', 'سرلوحه', 'سپاسگزاری', 'دربارهٔ نویسنده', 'دیگر آثار نویسنده', 'جلد', 'شروع خواندن', 'همهٔ حقوق محفوظ است.', 'کتاب الکترونیکی', 'جلد نرم', 'پیش‌درآمد', 'مؤخره')],
  ['he', 'Hebrew', 'עברית', 'hebrew', S('פרק {n}', 'חלק {n}', 'תוכן העניינים', 'עמוד שער', 'זכויות יוצרים', 'הקדשה', 'מוטו', 'תודות', 'על המחבר', 'מאת אותו מחבר', 'כריכה', 'התחלת קריאה', 'כל הזכויות שמורות.', 'ספר אלקטרוני', 'כריכה רכה', 'פרולוג', 'אפילוג')],
  ['hi', 'Hindi', 'हिन्दी', 'devanagari', S('अध्याय {n}', 'भाग {n}', 'विषय-सूची', 'शीर्षक पृष्ठ', 'कॉपीराइट', 'समर्पण', 'सूक्ति', 'आभार', 'लेखक के बारे में', 'लेखक की अन्य पुस्तकें', 'आवरण', 'पढ़ना शुरू करें', 'सर्वाधिकार सुरक्षित।', 'ई-बुक', 'पेपरबैक', 'प्रस्तावना', 'उपसंहार')],
  ['th', 'Thai', 'ไทย', 'thai', S('บทที่ {n}', 'ภาค {n}', 'สารบัญ', 'หน้าชื่อเรื่อง', 'ลิขสิทธิ์', 'คำอุทิศ', 'คำนำเรื่อง', 'กิตติกรรมประกาศ', 'เกี่ยวกับผู้เขียน', 'ผลงานอื่นของผู้เขียน', 'ปก', 'เริ่มอ่าน', 'สงวนลิขสิทธิ์', 'อีบุ๊ก', 'ปกอ่อน', 'บทนำ', 'บทส่งท้าย')],
  ['zh-Hans', 'Chinese (Simplified)', '简体中文', 'han-simplified', S('第{n}章', '第{n}部', '目录', '扉页', '版权', '献词', '题词', '致谢', '关于作者', '作者的其他作品', '封面', '开始阅读', '版权所有，侵权必究。', '电子书', '平装本', '序章', '尾声')],
  ['zh-Hant', 'Chinese (Traditional)', '繁體中文', 'han-traditional', S('第{n}章', '第{n}部', '目錄', '扉頁', '版權', '獻詞', '題詞', '致謝', '關於作者', '作者的其他作品', '封面', '開始閱讀', '版權所有，翻印必究。', '電子書', '平裝本', '序章', '尾聲')],
  ['ja', 'Japanese', '日本語', 'japanese', S('第{n}章', '第{n}部', '目次', '扉', '著作権表示', '献辞', 'エピグラフ', '謝辞', '著者紹介', '同じ著者の作品', '表紙', '本文を読む', '無断転載・複製を禁じます。', '電子書籍', 'ペーパーバック', 'プロローグ', 'エピローグ')],
  ['ko', 'Korean', '한국어', 'korean', S('제{n}장', '제{n}부', '목차', '속표지', '저작권', '헌사', '제사', '감사의 말', '저자 소개', '이 저자의 다른 책', '표지', '읽기 시작', '모든 권리 보유.', '전자책', '페이퍼백', '프롤로그', '에필로그')],
];

const RTL_SCRIPTS = new Set(['Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo', 'Adlm', 'Rohg', 'Mand', 'Samr', 'Mend', 'Yezi']);
const SCRIPT_GROUP: Record<string, ScriptGroup> = {
  Latn: 'latin', Cyrl: 'cyrillic', Grek: 'greek', Arab: 'arabic', Hebr: 'hebrew', Hans: 'han-simplified',
  Hant: 'han-traditional', Jpan: 'japanese', Kore: 'korean', Deva: 'devanagari', Thai: 'thai',
};

export const LANGUAGES: Language[] = ENTRIES.map(([code, name, native, script, strings]) => ({
  code,
  name,
  native,
  script,
  dir: script === 'arabic' || script === 'hebrew' ? 'rtl' : 'ltr',
  strings: { ...strings, notes: NOTES[code] ?? 'Notes', volume: VOLUME[code] ?? 'Book {n}' },
}));

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code.toLowerCase(), l]));

/** Canonical form of a language tag, or null if it isn't valid BCP 47. */
export function canonicalCode(code: string): string | null {
  try {
    return Intl.getCanonicalLocales(code.trim())[0] ?? null;
  } catch {
    return null;
  }
}

function maximizedScript(code: string): string | undefined {
  try {
    return new Intl.Locale(code).maximize().script;
  } catch {
    return undefined;
  }
}

/** Finds the registry entry for a tag: exact match, then by script (zh-TW → zh-Hant), then by base language. */
function registryEntry(code: string): Language | undefined {
  const lower = code.toLowerCase();
  const exact = BY_CODE.get(lower);
  if (exact) return exact;
  const base = lower.split('-')[0];
  if (base === 'zh') return BY_CODE.get(maximizedScript(code) === 'Hant' ? 'zh-hant' : 'zh-hans');
  if (base === 'no' || base === 'nn') return BY_CODE.get('nb');
  return BY_CODE.get(base);
}

const nameCache = new Map<string, Language>();

/** Everything Recto needs to typeset a language, for any BCP 47 tag. */
export function languageInfo(code: string): Language {
  const canonical = canonicalCode(code || 'en') ?? 'en';
  const cached = nameCache.get(canonical);
  if (cached) return cached;
  const entry = registryEntry(canonical);
  let info: Language;
  if (entry) {
    info = { ...entry, code: canonical };
  } else {
    const script = maximizedScript(canonical);
    let name = canonical;
    let native = canonical;
    try {
      name = new Intl.DisplayNames(['en'], { type: 'language' }).of(canonical) ?? canonical;
      native = new Intl.DisplayNames([canonical], { type: 'language' }).of(canonical) ?? name;
    } catch {
      // Unknown to this runtime's Intl data: keep the code as the name.
    }
    info = {
      code: canonical,
      name,
      native,
      script: (script && SCRIPT_GROUP[script]) || (script === 'Latn' ? 'latin' : 'other'),
      dir: script && RTL_SCRIPTS.has(script) ? 'rtl' : 'ltr',
    };
  }
  nameCache.set(canonical, info);
  return info;
}

/** The book words for a language, falling back to English for untranslated languages. */
export function bookStrings(code: string): BookStrings {
  return languageInfo(code).strings ?? BY_CODE.get('en')!.strings!;
}

/** Scripts with upper and lower case, where small caps, drop caps and letterspacing make sense. */
export function isBicameral(script: ScriptGroup): boolean {
  return script === 'latin' || script === 'cyrillic' || script === 'greek';
}

export function isCjk(script: ScriptGroup): boolean {
  return script === 'han-simplified' || script === 'han-traditional' || script === 'japanese' || script === 'korean';
}
