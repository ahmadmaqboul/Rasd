/**
 * Number expressions inside Arabic text: "2+1", "3×4", "10-15", "1/2". In an Arabic paragraph the browser treats
 * their digits as Arabic numbers, and a "+" or "-" between two of them is not kept between them, so «عرض 2+1»
 * renders as «عرض 1+2» — a different offer. Wrapping each expression in Unicode isolate marks (LRI … PDI) keeps
 * it in the order it was written. Plain numbers, percentages and decimals need nothing and are left alone.
 */
const NUMBER_EXPRESSION = /\d+(?:[.,]\d+)?(?:\s?[+×xX*\-–/:=]\s?\d+(?:[.,]\d+)?)+/g;

export function isolateNumberRuns(text: string): string {
  return text.replace(NUMBER_EXPRESSION, match => `⁦${match}⁩`);
}
