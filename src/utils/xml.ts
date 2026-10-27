/**
 * A parsed XML element. Offsets index into the source string, so callers can
 * copy an element's markup verbatim instead of re-serializing it.
 */
export interface XmlElement {
  /** Tag name as written, including any namespace prefix (`svg:path`). */
  readonly name: string;
  /** Tag name without its namespace prefix (`path`). */
  readonly localName: string;
  /** Attribute values with entities decoded, keyed by name as written. */
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlElement[];
  /** Direct text and CDATA content, concatenated. */
  readonly text: string;
  /** Offset of the element's opening `<`. */
  readonly start: number;
  /** Offset just past the start tag's `>`. */
  readonly startTagEnd: number;
  /** Offset just past the element's final `>`. */
  readonly end: number;
}

interface MutableElement extends XmlElement {
  readonly children: MutableElement[];
  text: string;
  end: number;
}

interface ParseState {
  readonly source: string;
  pos: number;
  readonly stack: MutableElement[];
  root: MutableElement | null;
}

/** Deeper nesting than this is never legitimate SVG and would blow the stack in tree walks. */
export const MAX_XML_DEPTH = 256;

const TAG_NAME = /[^\s/>]+/y;
const ATTRIBUTE = /\s+([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
const TAG_CLOSE = /\s*(\/?)>/y;
const ENTITY = /&(?:#(\d+)|#x([\da-fA-F]+)|(lt|gt|amp|quot|apos));/g;
const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
]);

/**
 * Parses an XML document into an element tree. Comments, processing
 * instructions and the DOCTYPE are skipped. Throws a RangeError on malformed
 * markup. This is a small, non-validating parser: it exists so SVG parsing
 * runs identically in the browser and in Node tests, without a DOM.
 */
export function parseXml(source: string): XmlElement {
  const state: ParseState = { source, pos: 0, stack: [], root: null };
  while (state.pos < source.length) {
    const lt = source.indexOf('<', state.pos);
    appendText(state, source.slice(state.pos, lt === -1 ? source.length : lt));
    if (lt === -1) {
      break;
    }
    state.pos = lt;
    readMarkup(state);
  }
  const unclosed = state.stack.at(-1);
  if (unclosed !== undefined) {
    throw new RangeError(`Unclosed <${unclosed.name}> element`);
  }
  if (state.root === null) {
    throw new RangeError('No root element found');
  }
  return state.root;
}

/** Decodes the five predefined XML entities and numeric character references. */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) {
    return text;
  }
  return text.replace(
    ENTITY,
    (whole, decimal: string | undefined, hex: string | undefined, named: string | undefined) => {
      if (named !== undefined) {
        return NAMED_ENTITIES.get(named) ?? whole;
      }
      const codePoint = decimal === undefined ? Number.parseInt(hex ?? '', 16) : Number(decimal);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : whole;
    },
  );
}

/** Escapes a string for use inside a double-quoted XML attribute. */
export function escapeXmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
}

function appendText(state: ParseState, text: string, raw = false): void {
  const parent = state.stack.at(-1);
  if (parent !== undefined && text !== '') {
    parent.text += raw ? text : decodeEntities(text);
  }
}

function readMarkup(state: ParseState): void {
  const { source, pos } = state;
  if (source.startsWith('<!--', pos)) {
    state.pos = indexOrThrow(source, '-->', pos) + 3;
  } else if (source.startsWith('<![CDATA[', pos)) {
    const end = indexOrThrow(source, ']]>', pos);
    appendText(state, source.slice(pos + 9, end), true);
    state.pos = end + 3;
  } else if (source.startsWith('<?', pos)) {
    state.pos = indexOrThrow(source, '?>', pos) + 2;
  } else if (source.startsWith('<!', pos)) {
    state.pos = skipDoctype(source, pos);
  } else if (source.startsWith('</', pos)) {
    readEndTag(state);
  } else {
    readStartTag(state);
  }
}

function indexOrThrow(source: string, needle: string, from: number): number {
  const index = source.indexOf(needle, from);
  if (index === -1) {
    throw new RangeError(`Expected "${needle}" after offset ${String(from)}`);
  }
  return index;
}

/** Skips `<!DOCTYPE …>`, including an internal subset in square brackets. */
function skipDoctype(source: string, pos: number): number {
  const close = indexOrThrow(source, '>', pos);
  const bracket = source.indexOf('[', pos);
  if (bracket === -1 || bracket > close) {
    return close + 1;
  }
  return indexOrThrow(source, '>', indexOrThrow(source, ']', bracket)) + 1;
}

function readStartTag(state: ParseState): void {
  const { source, pos } = state;
  TAG_NAME.lastIndex = pos + 1;
  const name = TAG_NAME.exec(source)?.[0];
  if (name === undefined) {
    throw new RangeError(`Malformed tag at offset ${String(pos)}`);
  }
  const attributes = new Map<string, string>();
  let cursor = TAG_NAME.lastIndex;
  for (
    let match = execAt(ATTRIBUTE, source, cursor);
    match;
    match = execAt(ATTRIBUTE, source, cursor)
  ) {
    attributes.set(match[1] ?? '', decodeEntities(match[2] ?? match[3] ?? ''));
    cursor = ATTRIBUTE.lastIndex;
  }
  const close = execAt(TAG_CLOSE, source, cursor);
  if (close === null) {
    throw new RangeError(`Malformed <${name}> tag at offset ${String(pos)}`);
  }
  const startTagEnd = TAG_CLOSE.lastIndex;
  const element: MutableElement = {
    name,
    localName: name.slice(name.indexOf(':') + 1),
    attributes,
    children: [],
    text: '',
    start: pos,
    startTagEnd,
    end: startTagEnd,
  };
  attach(state, element, close[1] === '/');
  state.pos = startTagEnd;
}

function execAt(pattern: RegExp, source: string, index: number): RegExpExecArray | null {
  pattern.lastIndex = index;
  return pattern.exec(source);
}

function attach(state: ParseState, element: MutableElement, selfClosing: boolean): void {
  const parent = state.stack.at(-1);
  if (parent !== undefined) {
    parent.children.push(element);
  } else if (state.root === null) {
    state.root = element;
  } else {
    throw new RangeError(`Unexpected second root element <${element.name}>`);
  }
  if (selfClosing) {
    return;
  }
  if (state.stack.length >= MAX_XML_DEPTH) {
    throw new RangeError(`Elements are nested more than ${String(MAX_XML_DEPTH)} levels deep`);
  }
  state.stack.push(element);
}

function readEndTag(state: ParseState): void {
  const { source, pos } = state;
  const close = indexOrThrow(source, '>', pos);
  const name = source.slice(pos + 2, close).trim();
  const element = state.stack.pop();
  if (element?.name !== name) {
    throw new RangeError(`Unexpected </${name}> at offset ${String(pos)}`);
  }
  element.end = close + 1;
  state.pos = close + 1;
}
