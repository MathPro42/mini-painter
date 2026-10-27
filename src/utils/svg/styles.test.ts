import { describe, expect, it } from 'vitest';
import { parseXml } from '../xml';
import { declaredValue, parseDeclarations, parseStyleSheet } from './styles';

describe('parseStyleSheet', () => {
  it('reads class, id, tag and compound selectors', () => {
    const rules = parseStyleSheet(
      '.cls-1{fill:#878787;} #a{fill:red} path{fill:blue} g.x.y{fill:none}',
    );
    expect(rules.map(({ tag, id, classes }) => ({ tag, id, classes }))).toEqual([
      { tag: 'path', id: null, classes: [] },
      { tag: null, id: null, classes: ['cls-1'] },
      { tag: 'g', id: null, classes: ['x', 'y'] },
      { tag: null, id: 'a', classes: [] },
    ]);
  });

  it('splits selector lists and shares their declarations', () => {
    const rules = parseStyleSheet('.a, .b { fill: #fff }');
    expect(rules).toHaveLength(2);
    expect(rules[1]?.declarations.get('fill')).toBe('#fff');
  });

  it('keeps source order among equally specific rules', () => {
    const rules = parseStyleSheet('.a{fill:red} .b{fill:blue} .c{fill:green}');
    expect(rules.map((rule) => rule.classes[0])).toEqual(['a', 'b', 'c']);
  });

  it('ignores comments, unsupported selectors and at-rule wrappers', () => {
    const rules = parseStyleSheet(
      '/* .gone{fill:red} */ g > path{fill:red} .a:hover{fill:red} * {stroke:none} @media print { .p{fill:red} }',
    );
    expect(rules.map((rule) => rule.classes[0] ?? rule.tag)).toEqual([null, 'p']);
  });
});

describe('parseDeclarations', () => {
  it('lowercases names, trims values and drops !important', () => {
    const declarations = parseDeclarations(' FILL : #ABC !important; stroke:none;;bogus');
    expect([...declarations]).toEqual([
      ['fill', '#ABC'],
      ['stroke', 'none'],
    ]);
  });
});

describe('declaredValue', () => {
  const rules = parseStyleSheet(
    '.warm{fill:#c00} #hot{fill:#f00} rect{fill:#00f} .warm.cold{fill:#0ff}',
  );
  const value = (markup: string, property = 'fill'): string | undefined =>
    declaredValue(parseXml(markup), property, rules);

  it('prefers the style attribute, then rules, then the presentation attribute', () => {
    expect(value('<rect class="warm" fill="#111" style="fill:#222"/>')).toBe('#222');
    expect(value('<rect class="warm" fill="#111"/>')).toBe('#c00');
    expect(value('<circle fill="#111"/>')).toBe('#111');
  });

  it('applies the most specific matching rule', () => {
    expect(value('<rect id="hot" class="warm"/>')).toBe('#f00');
    expect(value('<rect class="warm"/>')).toBe('#c00');
    expect(value('<rect class="cold warm"/>')).toBe('#0ff');
    expect(value('<rect/>')).toBe('#00f');
  });

  it('returns undefined when nothing declares the property', () => {
    expect(value('<circle/>')).toBeUndefined();
    expect(value('<rect class="warm"/>', 'fill-rule')).toBeUndefined();
  });
});
