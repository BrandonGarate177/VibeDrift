/**
 * init — MCP adapter.
 *
 * Channel-neutral logic (run + types) lives in
 * src/tools-core/tools/init.ts. This file only registers the tool on an MCP
 * server so an agent can configure a repo in-loop.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { run, inputSchema } from "../../tools-core/tools/init.js";
import { toToolResult } from "../envelope.js";
import { invalidateBaselineMem } from "../baseline-provider.js";

export * from "../../tools-core/tools/init.js";

export const registerInit = {
  run,
  register(server: McpServer): void {
    server.registerTool(
      "init",
      {
        title: "Initialize VibeDrift for this repo",
        description:
          "One-time setup. WRITES .vibedrift/config.json (default report format, CI score floor) unless you pass detectOnly:true. Auto-detects fixture/generated paths and returns them as `detected`, but only writes .vibedriftignore exclusions you pass in `exclude`, or when you set applyDetectedExcludes:true. To just preview the candidates without writing anything, call with detectOnly:true. Run once per repo so scans and the other tools skip non-product code. Local; writes only inside the given repo.",
        inputSchema,
      },
      async (args) => {
        const result = await run(args);
        // Exclusions change which files discovery sees — drop this server's
        // in-memory baseline so the next tool call rebuilds and honors them.
        if (result.excludesAdded.length > 0) invalidateBaselineMem(result.rootDir);
        return toToolResult(result);
      },
    );
  },
};
