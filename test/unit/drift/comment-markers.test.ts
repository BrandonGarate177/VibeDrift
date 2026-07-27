import { describe, it, expect } from "vitest";
import { pythonNonCodeLines, isCommentLine, C_STYLE_COMMENT_MARKERS, PYTHON_COMMENT_MARKERS } from "../../../src/drift/comment-markers.js";

describe("pythonNonCodeLines", () => {
  it("marks a one-line docstring as non-code (the case the two old copies disagreed on)", () => {
    // `"""like this"""` — an even count of triple-quotes on one line.
    expect(pythonNonCodeLines([`"""one-line docstring"""`, `from x import y`])).toEqual([true, false]);
  });

  it("marks a multi-line docstring body as non-code", () => {
    const lines = [`"""`, `from legacy import *`, `"""`, `from pkg.a import b`];
    expect(pythonNonCodeLines(lines)).toEqual([true, true, true, false]);
  });

  it("marks `#` comment lines as non-code and leaves real code alone", () => {
    expect(pythonNonCodeLines([`# from legacy import *`, `from pkg.a import b`])).toEqual([true, false]);
  });
});

describe("isCommentLine", () => {
  it("matches C-style and Python markers on leading-whitespace lines", () => {
    expect(isCommentLine("  // x", C_STYLE_COMMENT_MARKERS)).toBe(true);
    expect(isCommentLine("  /* x", C_STYLE_COMMENT_MARKERS)).toBe(true);
    expect(isCommentLine("  # x", PYTHON_COMMENT_MARKERS)).toBe(true);
    expect(isCommentLine("code // trailing", C_STYLE_COMMENT_MARKERS)).toBe(false);
  });
});
