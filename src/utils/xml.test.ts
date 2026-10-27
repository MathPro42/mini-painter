import { describe, expect, it } from 'vitest';
import { decodeEntities, escapeXmlAttribute, MAX_XML_DEPTH, parseXml } from './xml';

describe('parseXml', () => {
  it('builds the element tree with attributes', () => {
    const root = parseXml(`<svg viewBox="0 0 10 10"><g id='a'><path d="M0 0"/></g><rect/></svg>`);
    expect(root.name).toBe('svg');
    expect(root.attributes.get('viewBox')).toBe('0 0 10 10');
    expect(root.children.map((child) => child.name)).toEqual(['g', 'rect']);
    expect(root.children[0]?.attributes.get('id')).toBe('a');
    expect(root.children[0]?.children[0]?.attributes.get('d')).toBe('M0 0');
  });

  it('records offsets that slice out each element verbatim', () => {
    const source = '<svg>\n  <g class="x"><rect /></g>\n  <circle r="1"/>\n</svg>';
    const root = parseXml(source);
    const [group, circle] = root.children;
    expect(source.slice(group?.start, group?.end)).toBe('<g class="x"><rect /></g>');
    expect(source.slice(group?.start, group?.startTagEnd)).toBe('<g class="x">');
    expect(source.slice(circle?.start, circle?.end)).toBe('<circle r="1"/>');
    expect(root.end).toBe(source.length);
  });

  it('splits namespace prefixes from local names', () => {
    const root = parseXml('<svg:svg xmlns:svg="ns"><svg:path inkscape:label="x"/></svg:svg>');
    expect(root.localName).toBe('svg');
    expect(root.children[0]?.name).toBe('svg:path');
    expect(root.children[0]?.localName).toBe('path');
    expect(root.children[0]?.attributes.get('inkscape:label')).toBe('x');
  });

  it('collects text and CDATA, decoding entities only outside CDATA', () => {
    const root = parseXml('<style>.a{fill:red}&gt;<![CDATA[.b > .c {}&amp;]]></style>');
    expect(root.text).toBe('.a{fill:red}>.b > .c {}&amp;');
  });

  it('decodes entities in attribute values', () => {
    const root = parseXml('<g data-name="Fish &amp; Chips &#38; &#x26; &lt;3"/>');
    expect(root.attributes.get('data-name')).toBe('Fish & Chips & & <3');
  });

  it('skips the XML declaration, comments, DOCTYPE and text outside the root', () => {
    const source = `<?xml version="1.0"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd" [
  <!ENTITY ns_svg "http://www.w3.org/2000/svg">
]>
<!-- a comment with <tags> inside -->
<svg><!-- inner --><g/></svg>
trailing`;
    const root = parseXml(source);
    expect(root.name).toBe('svg');
    expect(root.children).toHaveLength(1);
  });

  it('skips a DOCTYPE without an internal subset', () => {
    expect(parseXml('<!DOCTYPE svg><svg/>').name).toBe('svg');
  });

  it.each([
    ['', 'No root element found'],
    ['just text', 'No root element found'],
    ['<svg><g></svg>', 'Unexpected </svg>'],
    ['<svg><g>', 'Unclosed <g> element'],
    ['<svg/><svg/>', 'Unexpected second root element <svg>'],
    ['<svg><g id="x></g></svg>', 'Malformed <g> tag'],
    ['<svg>< g/></svg>', 'Malformed tag'],
    ['<svg><!-- never closed </svg>', 'Expected "-->"'],
  ])('rejects %j', (source, message) => {
    expect(() => parseXml(source)).toThrow(RangeError);
    expect(() => parseXml(source)).toThrow(message);
  });

  it('rejects absurdly deep nesting', () => {
    const deep = '<g>'.repeat(MAX_XML_DEPTH + 1) + '</g>'.repeat(MAX_XML_DEPTH + 1);
    expect(() => parseXml(deep)).toThrow(/nested more than/);
    const ok = '<g>'.repeat(MAX_XML_DEPTH) + '</g>'.repeat(MAX_XML_DEPTH);
    expect(parseXml(ok).name).toBe('g');
  });
});

describe('decodeEntities', () => {
  it('returns text without entities unchanged', () => {
    expect(decodeEntities('plain')).toBe('plain');
  });

  it('leaves unknown and out-of-range references alone', () => {
    expect(decodeEntities('&nbsp; &#1114112; &quot;&apos;&gt;')).toBe(`&nbsp; &#1114112; "'>`);
  });
});

describe('escapeXmlAttribute', () => {
  it('escapes characters that would end or break an attribute', () => {
    expect(escapeXmlAttribute('a&b<c"d')).toBe('a&amp;b&lt;c&quot;d');
  });
});
