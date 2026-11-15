import type {ReactNode} from 'react';

/**
 * Left-to-right (Latin) text inside an Arabic UI: links, account names (@handle), commands, identifiers.
 * Without it the browser reorders the edge symbols (such as "/" and "@") so they show up on the wrong side:
 * "/rasd-analyze 1" is displayed as "rasd-analyze 1/". Details in docs/rtl.md.
 */
export function Ltr({children}: {children: ReactNode}) {
  return <bdi dir="ltr">{children}</bdi>;
}

/**
 * The string form of `<Ltr>`, for values interpolated into a translated string where JSX is not available
 * (labels, hints, aria text). Wraps the value in Unicode isolate marks (LRI … PDI) so its edge punctuation
 * stays put: without it «(@saedtel)» inside an Arabic sentence renders as «(saedtel@)».
 */
export function isolateLtr(value: string): string {
  return `\u2066${value}\u2069`;
}
