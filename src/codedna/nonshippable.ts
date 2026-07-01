/**
 * Non-shippable path classification — shared by the duplicate detectors.
 *
 * A file is "non-shippable" when it is test, example/demo, fixture/mock, or
 * generated code. Duplicate findings where EVERY involved function lives in
 * non-shippable code are not actionable: a maintainer will not consolidate two
 * test-suite `mkCtx()` helpers or two generated stubs. This mirrors the paid
 * deep-scan pre-filter's `_is_nonshippable` rule (vibe-drift-api
 * api/models/dup_prefilter.py) so the free CLI and the cloud path agree on what
 * counts as noise — the CLI just applies it BEFORE the finding is surfaced,
 * where the API applies it before the LLM panel.
 *
 * The rule stays CONSERVATIVE: a group is only dropped when ALL members are
 * non-shippable, so a real helper copied from src/ into a test still surfaces.
 */

// Kept in sync with the API regexes and src/output/tease.ts's non-shipped set.
const NOT_SHIPPED_RES: RegExp[] = [
  /(^|\/)(generated|__generated__)\/|\.(generated|gen)\.[A-Za-z0-9]+$|\.pb\.go$|_pb2?\.py$|\.min\.[A-Za-z0-9]+$/,
  /(^|\/)(fixtures?|__fixtures__|__mocks__|mocks|snapshots|__snapshots__)\//,
  /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[A-Za-z0-9]+$|_test\.(go|py)$|(^|\/)test_[^/]*\.py$/,
  /(^|\/)(examples?|demos?|samples?)\//,
];

/** True iff the path is test / example / fixture / generated code. */
export function isNonShippablePath(path: string): boolean {
  return NOT_SHIPPED_RES.some((re) => re.test(path));
}

/**
 * True iff EVERY path in the list is non-shippable. Used to drop duplicate
 * groups/pairs that are entirely confined to non-actionable code.
 */
export function allNonShippable(paths: readonly string[]): boolean {
  return paths.length > 0 && paths.every(isNonShippablePath);
}
