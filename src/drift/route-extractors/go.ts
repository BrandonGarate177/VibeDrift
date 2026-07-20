/**
 * Go route extractor — Echo / Gin / Gorilla mux.
 *
 * AST on a CLEAN parse (delegated to security-ast-go), regex fallback otherwise.
 */

import type { DriftFile } from "../types.js";
import { extractGoRoutesAst } from "../security-ast-go.js";
import type { RouteInfo, FileMiddleware, RouteExtractor } from "./types.js";
import {
  C_STYLE_COMMENT_MARKERS,
  isCommentLine,
  inheritedAuth,
  inheritedValidation,
  inheritedRateLimit,
  findHandlerContent,
} from "./shared.js";

function extractGoRoutesRegex(file: DriftFile, fileMiddleware: FileMiddleware | undefined): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const lines = file.content.split("\n");
  const echoPattern = /\.\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(\s*"([^"]+)"/;
  const gorillaPattern = /HandleFunc\s*\(\s*"([^"]+)".*\.Methods\s*\(\s*"(\w+)"/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment lines — prevents phantom routes from commented-out code.
    if (isCommentLine(line, C_STYLE_COMMENT_MARKERS)) continue;
    let method = "", path = "";
    const echoMatch = line.match(echoPattern);
    if (echoMatch) { method = echoMatch[1]; path = echoMatch[2]; }
    const gorillaMatch = line.match(gorillaPattern);
    if (gorillaMatch) { path = gorillaMatch[1]; method = gorillaMatch[2]; }
    if (!method || !path) continue;

    const context = lines.slice(Math.max(0, i - 10), i + 10).join("\n");
    const handlerContent = findHandlerContent(file.content, path);

    const perAuth = /[Aa]uth|[Tt]oken|require[A-Z]|middleware\.\w*[Aa]uth/.test(context);
    const perVal = /[Bb]ind|[Vv]alidat|[Pp]arse/.test(handlerContent);
    const perRate = /[Rr]ate[Ll]imit|[Tt]hrottle/.test(context + handlerContent);

    routes.push({
      method, path, file: file.relativePath, line: i + 1,
      hasAuth: inheritedAuth(perAuth, fileMiddleware),
      hasValidation: inheritedValidation(perVal, fileMiddleware),
      hasRateLimit: inheritedRateLimit(perRate, fileMiddleware),
      hasErrorHandler: /catch|err\s*!=\s*nil|try|except|\.catch/.test(handlerContent),
    });
  }
  return routes;
}

export const goRouteExtractor: RouteExtractor = {
  language: "go",
  extract(file, deps) {
    // AST only on a CLEAN parse: tree-sitter always returns a tree for broken Go
    // (with ERROR nodes), and error recovery SWALLOWS later valid registrations
    // into a broken call's argument_list as clean-looking nested calls (a
    // cross-bless hazard). Any parse error routes the whole file to the regex,
    // byte-identical to today's behavior INCLUDING the regex path's known
    // over-blesses (see the pinned-legacy tests).
    if (file.tree && !file.tree.rootNode.hasError) {
      // The cross-file index lets an imported package middleware selector resolve
      // to its in-repo defining body; an unresolved / external / index-disabled
      // selector stays UNSURE, byte-identical to the in-file-only path.
      return extractGoRoutesAst(file.tree, file.relativePath, deps.xfile);
    }
    return extractGoRoutesRegex(file, deps.fileMw.get(file.relativePath));
  },
};
