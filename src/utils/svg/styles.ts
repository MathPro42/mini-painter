import type { XmlElement } from '../xml';

/** One `selector { declarations }` pair from a `<style>` sheet, reduced to a compound selector. */
export interface StyleRule {
  readonly tag: string | null;
  readonly id: string | null;
  readonly classes: readonly string[];
  /** Ids ×10000 + classes ×100 + tag, so a plain numeric compare orders rules. */
  readonly specificity: number;
  readonly declarations: ReadonlyMap<string, string>;
}

const COMMENT = /\/\*[\s\S]*?\*\//g;
const RULE_BLOCK = /([^{}]+)\{([^{}]*)\}/g;
const COMPOUND_SELECTOR = /^(\*|[a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/;
const SELECTOR_PART = /([.#])([\w-]+)/g;
const IMPORTANT = /\s*!important\s*$/i;

/**
 * Parses CSS from `<style>` elements. Only compound selectors without
 * combinators (`path`, `.cls-1`, `#id`, `g.a.b`) are kept: that is what SVG
 * editors emit, and it's all fill resolution needs. Other selectors are
 * skipped, and at-rule wrappers are ignored, so rules inside `@media` always
 * apply. Rules come back sorted by specificity, then source order.
 */
export function parseStyleSheet(css: string): StyleRule[] {
  const rules: StyleRule[] = [];
  for (const [, selectorList = '', body = ''] of css.replace(COMMENT, '').matchAll(RULE_BLOCK)) {
    const declarations = parseDeclarations(body);
    for (const selector of selectorList.split(',')) {
      const rule = compoundRule(selector.trim(), declarations);
      if (rule !== null) {
        rules.push(rule);
      }
    }
  }
  // Array.prototype.sort is stable, so equal specificity keeps source order.
  return rules.sort((a, b) => a.specificity - b.specificity);
}

/** Parses `prop: value; …` (a rule body or a `style` attribute). Names are lowercased. */
export function parseDeclarations(text: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const declaration of text.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon > 0) {
      const name = declaration.slice(0, colon).trim().toLowerCase();
      declarations.set(
        name,
        declaration
          .slice(colon + 1)
          .replace(IMPORTANT, '')
          .trim(),
      );
    }
  }
  return declarations;
}

/**
 * The value an element declares for a property, by CSS precedence: the
 * `style` attribute, then the most specific (latest) matching rule, then the
 * presentation attribute. `undefined` when nothing declares it.
 */
export function declaredValue(
  element: XmlElement,
  property: string,
  rules: readonly StyleRule[],
): string | undefined {
  const inline = parseDeclarations(element.attributes.get('style') ?? '').get(property);
  if (inline !== undefined) {
    return inline;
  }
  const rule = rules.findLast(
    (candidate) => candidate.declarations.has(property) && ruleMatches(candidate, element),
  );
  return rule?.declarations.get(property) ?? element.attributes.get(property);
}

function compoundRule(
  selector: string,
  declarations: ReadonlyMap<string, string>,
): StyleRule | null {
  const match = COMPOUND_SELECTOR.exec(selector);
  if (match === null || selector === '') {
    return null;
  }
  const tag = match[1] === undefined || match[1] === '*' ? null : match[1];
  const { id, classes } = idAndClasses(match[2] ?? '');
  const specificity = (id === null ? 0 : 10000) + classes.length * 100 + (tag === null ? 0 : 1);
  return { tag, id, classes, specificity, declarations };
}

function idAndClasses(parts: string): { id: string | null; classes: string[] } {
  let id: string | null = null;
  const classes: string[] = [];
  for (const [, kind, name = ''] of parts.matchAll(SELECTOR_PART)) {
    if (kind === '#') {
      id = name;
    } else {
      classes.push(name);
    }
  }
  return { id, classes };
}

function ruleMatches(rule: StyleRule, element: XmlElement): boolean {
  if (rule.tag !== null && rule.tag !== element.localName) {
    return false;
  }
  if (rule.id !== null && rule.id !== element.attributes.get('id')) {
    return false;
  }
  if (rule.classes.length === 0) {
    return true;
  }
  const classes = (element.attributes.get('class') ?? '').split(/\s+/);
  return rule.classes.every((name) => classes.includes(name));
}
