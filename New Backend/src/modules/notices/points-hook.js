// The demerit points a notice carries (docs/08 §8), shown on the notice and
// the payment page. Provided by the demerit module, which depends on
// notices (not the other way round); none until it does, or while the
// scheme is off.

/** @type {(n: any) => Promise<number | null>} */
let noticePoints = async () => null;

/** @param {(n: any) => Promise<number | null>} fn */
export function provideNoticePoints(fn) {
  noticePoints = fn;
}

/** @param {any} n */
export const pointsOf = (n) => noticePoints(n);
