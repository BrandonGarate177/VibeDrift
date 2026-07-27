import { describe, it, expect } from "vitest";
import { rustImportClassifier } from "../../../src/drift/import-style/rust.js";
import { fileWithTree } from "../../helpers/drift-tree.js";
import type { AxisClassification } from "../../../src/drift/import-style/types.js";
import type { DriftFile } from "../../../src/drift/types.js";

const rs = (path: string, src: string) => fileWithTree(path, src, "rust");
function treeless(path: string, content: string): DriftFile {
  return { relativePath: path, language: "rust", content, lineCount: content.split("\n").length };
}
const axis = (out: AxisClassification[], a: string) => out.filter((c) => c.axis === a);

describe("Rust glob imports (rust_glob) — AST path", () => {
  it("glob: a wildcard use", async () => {
    const f = await rs("src/main.rs", `use std::collections::HashMap;\nuse crate::prelude::*;\n`);
    const out = axis(rustImportClassifier.classify(f), "rust_glob");
    expect(out).toHaveLength(1);
    expect(out[0].pattern).toBe("glob");
  });

  it("explicit: ≥2 uses, none glob", async () => {
    const f = await rs("src/main.rs", `use std::collections::HashMap;\nuse serde::Deserialize;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("explicit");
  });

  it("not decidable: a single explicit use", async () => {
    const f = await rs("src/main.rs", `use std::collections::HashMap;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")).toEqual([]);
  });

  it("decidable on a single glob use", async () => {
    const f = await rs("src/main.rs", `use crate::prelude::*;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("glob");
  });
});

describe("Rust glob imports — regex fallback (tree-less)", () => {
  it("glob", () => {
    const f = treeless("src/main.rs", `use std::collections::HashMap;\nuse crate::prelude::*;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("glob");
  });

  it("explicit", () => {
    const f = treeless("src/main.rs", `use std::collections::HashMap;\nuse serde::Deserialize;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("explicit");
  });
});

describe("Rust intra-crate use path (rust_use_path)", () => {
  it("crate: ≥2 absolute intra-crate uses", async () => {
    const f = await rs("src/a.rs", `use crate::models::User;\nuse crate::db::Session;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_use_path")[0]?.pattern).toBe("crate");
  });

  it("relative: ≥2 super/self uses", async () => {
    const f = await rs("src/a.rs", `use super::models::User;\nuse self::helpers::x;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_use_path")[0]?.pattern).toBe("relative");
  });

  it("not decidable: only external-crate uses", async () => {
    const f = await rs("src/a.rs", `use std::collections::HashMap;\nuse serde::Deserialize;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_use_path")).toEqual([]);
  });

  it("regex fallback: crate", () => {
    const f = treeless("src/a.rs", `use crate::models::User;\nuse crate::db::Session;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_use_path")[0]?.pattern).toBe("crate");
  });
});

describe("Rust use grouping (rust_grouping)", () => {
  it("grouped: std and internal separated by a blank line", async () => {
    const f = await rs("src/a.rs", `use std::collections::HashMap;\n\nuse crate::models::User;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_grouping")[0]?.pattern).toBe("grouped");
  });

  it("flat: ≥2 origins, no blank line", async () => {
    const f = await rs("src/a.rs", `use std::collections::HashMap;\nuse crate::models::User;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_grouping")[0]?.pattern).toBe("flat");
  });

  it("not decidable: a single origin (std only)", async () => {
    const f = await rs("src/a.rs", `use std::collections::HashMap;\nuse std::fmt::Debug;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_grouping")).toEqual([]);
  });

  it("regex fallback: grouped", () => {
    const f = treeless("src/a.rs", `use std::collections::HashMap;\n\nuse serde::Deserialize;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_grouping")[0]?.pattern).toBe("grouped");
  });
});


describe("Rust relative-glob idioms are excluded (precision)", () => {
  it("rust_glob: idiomatic `use super::*;` (test re-import) is not counted as a glob", () => {
    const f = treeless("src/a.rs", `use crate::foo::Bar;\nuse crate::baz::Qux;\nuse super::*;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("explicit");
  });

  it("rust_glob: `use self::Enum::*;` (enum-variant scoping) is not counted as a glob", () => {
    const f = treeless("src/a.rs", `use crate::foo::Bar;\nuse crate::baz::Qux;\nuse self::Color::*;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("explicit");
  });

  it("rust_glob: a non-relative glob (crate::/external ::*) still flags as glob", () => {
    const f = treeless("src/a.rs", `use crate::prelude::*;\nuse std::fmt::Debug;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("glob");
  });

  it("rust_use_path: a `use super::*;` glob does not count as a relative use", () => {
    // The glob is excluded, leaving <2 intra-crate uses → not decidable.
    const f = treeless("src/a.rs", `use crate::foo::Bar;\nuse super::*;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_use_path")).toEqual([]);
  });

  it("rust_use_path: a non-glob `use super::foo;` still counts as relative", () => {
    const f = treeless("src/a.rs", `use crate::foo::Bar;\nuse super::helper;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_use_path")[0]?.pattern).toBe("crate");
  });
});


describe("Rust prelude globs excluded; crate-root glob kept (precision)", () => {
  it("rust_glob: `use …::prelude::*;` is idiomatic and not counted as a glob", () => {
    const f = treeless("src/a.rs", `use rayon::prelude::*;\nuse crate::foo::Bar;\nuse crate::baz::Qux;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("explicit");
  });

  it("rust_glob: `use crate::*;` (crate-root glob) is still flagged as a glob", () => {
    const f = treeless("src/a.rs", `use crate::*;\nuse crate::foo::Bar;\nuse crate::baz::Qux;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("glob");
  });
});

describe("Rust grouping: blank line vs wrapped/commented uses", () => {
  it("a rustfmt-wrapped multiline use does not fake a group (stays flat)", async () => {
    const f = await rs("src/a.rs", `use std::collections::{\n    HashMap,\n    HashSet,\n};\nuse crate::foo::Bar;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_grouping")[0]?.pattern).toBe("flat");
  });

  it("a comment between uses does not fake a group (stays flat)", async () => {
    const f = await rs("src/a.rs", `use std::fmt::Debug;\n// note\nuse crate::foo::Bar;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_grouping")[0]?.pattern).toBe("flat");
  });

  it("a real blank line still marks a group", async () => {
    const f = await rs("src/a.rs", `use std::fmt::Debug;\n\nuse crate::foo::Bar;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_grouping")[0]?.pattern).toBe("grouped");
  });
});

describe("Rust visibility prefixes (pub(crate) etc.)", () => {
  it("rust_use_path counts `pub(crate) use` (regex fallback)", () => {
    const f = treeless("src/a.rs", `pub(crate) use crate::a::B;\npub(crate) use crate::c::D;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_use_path")[0]?.pattern).toBe("crate");
  });

  it("`pub(crate) use super::*;` is still an idiomatic glob, not flagged (AST)", async () => {
    const f = await rs("src/a.rs", `pub(crate) use super::*;\nuse crate::a::B;\nuse crate::c::D;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("explicit");
  });
});


describe("Rust review round 2 — test-module poisoning, AST glob, fallback guards", () => {
  it("R1: a #[cfg(test)] mod's `use super::*;` does not poison grouping", async () => {
    // Only the two top-level std uses count (single origin) → no grouping finding.
    const f = await rs("src/a.rs", `use std::fmt;\nuse std::io;\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n}\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_grouping")).toEqual([]);
  });

  it("R2: a test module's crate:: uses do not flip rust_use_path", async () => {
    const f = await rs("src/a.rs", `use super::config::Config;\nuse super::db::Db;\n\n#[cfg(test)]\nmod tests {\n    use crate::test_utils::a;\n    use crate::test_utils::b;\n    use crate::test_utils::c;\n}\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_use_path")[0]?.pattern).toBe("relative");
  });

  it("R3: a rustfmt-wrapped `io::*` is detected as a glob (AST use_wildcard)", async () => {
    const f = await rs("src/a.rs", `use tokio::{\n    io::*,\n    net::TcpStream,\n};\nuse std::fmt::Debug;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("glob");
  });

  it("R3: a brace-group wildcard `{self, *}` is detected as a glob", async () => {
    const f = await rs("src/a.rs", `use std::io::{self, *};\nuse std::fmt::Debug;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("glob");
  });

  it("R6: rust_use_path evidence shows only the winning side", async () => {
    const f = await rs("src/a.rs", `use super::helpers::x;\nuse crate::models::User;\nuse crate::db::Session;\n`);
    const out = axis(rustImportClassifier.classify(f), "rust_use_path");
    expect(out[0]?.pattern).toBe("crate");
    expect(out[0].evidence.every((e) => e.code.includes("crate::"))).toBe(true);
  });

  it("R7: leading-`::` uses still resolve a head (origins decidable)", async () => {
    const f = await rs("src/a.rs", `use ::std::mem;\nuse ::serde::Deserialize;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_grouping")[0]?.pattern).toBe("flat");
  });

  it("R4: fallback ignores uses inside a block comment", () => {
    const f = treeless("src/a.rs", `/*\nuse crate::old::Widget;\nuse crate::old::Gadget;\n*/\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_use_path")).toEqual([]);
  });

  it("R4: fallback does not treat a trailing-comment `::*` as a glob", () => {
    const f = treeless("src/a.rs", `use crate::x::Foo; // was: use crate::x::*\nuse crate::y::Bar;\nuse crate::z::Baz;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("explicit");
  });

  it("R5: fallback treats a blank inside a wrapped brace group as flat, not grouped", () => {
    const f = treeless("src/a.rs", `use std::collections::{\n    HashMap,\n\n    HashSet,\n};\nuse crate::foo::Bar;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_grouping")[0]?.pattern).toBe("flat");
  });
});

describe("Rust review round 3 — wrapped external prelude exemption (full-decl text)", () => {
  it("a rustfmt-wrapped `use rayon::{ prelude::*, … }` is exempt, not a glob (AST)", async () => {
    // The glob is on a continuation line; the exemption must see the whole decl,
    // not just `use rayon::{`. Two explicit crate uses remain → explicit.
    const f = await rs("src/a.rs", `use rayon::{\n    prelude::*,\n    iter::IntoParallelRefIterator,\n};\nuse crate::foo::Bar;\nuse crate::baz::Qux;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("explicit");
  });

  it("the same wrapped prelude is exempt in the regex fallback too", () => {
    const f = treeless("src/a.rs", `use rayon::{\n    prelude::*,\n    iter::IntoParallelRefIterator,\n};\nuse crate::foo::Bar;\nuse crate::baz::Qux;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("explicit");
  });

  it("a wrapped NON-prelude external glob still flags as a glob (no over-exemption)", async () => {
    const f = await rs("src/a.rs", `use foo::{\n    bar::*,\n    baz::Qux,\n};\nuse std::fmt::Debug;\n`);
    expect(axis(rustImportClassifier.classify(f), "rust_glob")[0]?.pattern).toBe("glob");
  });
});
