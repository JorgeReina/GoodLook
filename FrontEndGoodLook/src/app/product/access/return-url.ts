import { PRIMARY_OUTLET, Router, UrlTree } from '@angular/router';

const routeLengths = new Map([
  ['negocios', 2], ['reservar', 2], ['mis-citas', 1], ['mi-agenda', 1], ['gestion', 1], ['invitacion', 1],
]);

export function internalReturn(router: Router, value: unknown): UrlTree | null {
  if (typeof value !== 'string' || !value.startsWith('/') || /^\/[/\\]|[\\\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }

  const tree = router.parseUrl(value);
  const primary = tree.root.children[PRIMARY_OUTLET];
  if (Object.keys(tree.root.children).some(outlet => outlet !== PRIMARY_OUTLET) ||
      (primary && (primary.hasChildren() || primary.segments.some(segment => Object.keys(segment.parameters).length)))) {
    return null;
  }
  if (value === '/' || (primary && routeLengths.get(primary.segments[0]?.path) === primary.segments.length)) {
    return tree;
  }
  return null;
}
