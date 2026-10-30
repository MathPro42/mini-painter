import { h } from 'preact';
import type { Component, FunctionComponent, VNode } from 'preact';

/**
 * Wraps a component so it renders again only when one of its props changes
 * (compared with `Object.is`), like preact/compat's `memo` without compat's
 * global vnode hooks. Long lists use it, so changing one item, such as the
 * paint of one region, doesn't render every other item.
 */
export function memo<P extends object>(component: FunctionComponent<P>): FunctionComponent<P> {
  // Preact runs function components with their Component instance as `this`.
  function Memoized(this: Component<P>, props: P): VNode<P> {
    this.shouldComponentUpdate = (next) => !sameProps(this.props, next);
    return h(component, props);
  }
  Memoized.displayName = `Memo(${component.displayName ?? component.name})`;
  return Memoized;
}

function sameProps(a: object, b: object): boolean {
  const keysA = Object.keys(a);
  return (
    keysA.length === Object.keys(b).length &&
    keysA.every((key) => Object.is(Reflect.get(a, key), Reflect.get(b, key)))
  );
}
