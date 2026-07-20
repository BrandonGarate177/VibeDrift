/**
 * JavaScript / TypeScript route extractor — Express / Hono / Fastify / Koa.
 * Registered under both the `javascript` and `typescript` dispatch keys.
 *
 * AST when a parsed tree is available (delegated to security-ast), regex
 * fallback otherwise.
 */

import type { DriftFile } from "../types.js";
import { extractJsRoutesAst } from "../security-ast.js";
import type { RouteInfo, FileMiddleware, RouteExtractor } from "./types.js";
import {
  C_STYLE_COMMENT_MARKERS,
  isCommentLine,
  inheritedAuth,
  inheritedValidation,
  inheritedRateLimit,
} from "./shared.js";

function extractJsRoutesRegex(file: DriftFile, fileMiddleware: FileMiddleware | undefined): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const lines = file.content.split("\n");
  const expressPattern = /\.(?:get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/;

  for (let i = 0; i < lines.length; i++) {
    // Skip comment lines — prevents phantom routes from commented-out code.
    if (isCommentLine(lines[i], C_STYLE_COMMENT_MARKERS)) continue;
    const match = lines[i].match(expressPattern);
    if (!match) continue;
    const path = match[1];
    const method = match[0].match(/\.(get|post|put|patch|delete|all)/)?.[1]?.toUpperCase() ?? "ANY";
    const context = lines.slice(Math.max(0, i - 5), i + 20).join("\n");

    const perAuth = /(?:requireAuth|isAuthenticated|passport\.authenticate|verifyToken|jwt|authMiddleware)/.test(context);
    const perVal = /validate|joi|zod|yup|celebrate|body\(|query\(/.test(context);
    const perRate = /rateLimit|throttle|limiter/.test(context);

    routes.push({
      method, path, file: file.relativePath, line: i + 1,
      hasAuth: inheritedAuth(perAuth, fileMiddleware),
      hasValidation: inheritedValidation(perVal, fileMiddleware),
      hasRateLimit: inheritedRateLimit(perRate, fileMiddleware),
      hasErrorHandler: /catch|try|\.catch|next\(err/.test(context),
    });
  }
  return routes;
}

export const jsRouteExtractor: RouteExtractor = {
  language: "javascript", // also serves the "typescript" dispatch key
  extract(file, deps) {
    const fileMiddleware = deps.fileMw.get(file.relativePath);
    if (file.tree) {
      return extractJsRoutesAst(file.tree, file.relativePath, fileMiddleware);
    }
    return extractJsRoutesRegex(file, fileMiddleware);
  },
};
