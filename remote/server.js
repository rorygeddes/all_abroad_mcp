// remote/server.js
//
// All Abroad MCP remote server — Express + StreamableHTTP + OAuth 2.1
//
// Users add this to Claude via Settings → Integrations → Add custom integration.
// They paste the MCP URL (https://mcp.allabroad.ai/mcp).
// Claude discovers OAuth metadata at /.well-known/oauth-authorization-server,
// redirects the user to /oauth/authorize to sign in with their All Abroad account,
// then sends a Bearer token on every tool call.
// Each call resolves to a fresh Supabase JWT so RLS enforces per-user isolation.
//
// Env vars required (set in Vercel project settings):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_ANON_KEY
//   MCP_SERVER_URL      (https://mcp.allabroad.ai)
//   PORT                (optional, defaults to 3001)

import express from "express";
import { randomUUID } from "crypto";

import { Server }                        from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter }                 from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth }             from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { AllAbroadOAuthProvider, handleLoginSubmit, handleGoogleComplete, getSupabaseJwtForMcpToken }
  from "./oauth-provider.js";

// ── Tool registry ─────────────────────────────────────────────────────────────
import { listTrips }      from "../tools/list_trips.js";
import { getTripDetails } from "../tools/get_trip_details.js";
import { listTripIdeas }  from "../tools/list_trip_ideas.js";
import { getTripMembers } from "../tools/get_trip_members.js";
import { listFriends }    from "../tools/list_friends.js";

const TOOLS = [
  listTrips,
  getTripDetails,
  listTripIdeas,
  getTripMembers,
  listFriends,
];

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// ── Config ────────────────────────────────────────────────────────────────────

const PORT       = parseInt(process.env.PORT || "3001", 10);
const SERVER_URL = process.env.MCP_SERVER_URL ?? `http://localhost:${PORT}`;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_ANON_KEY) {
  console.error("[allabroad-mcp] ❌ Missing Supabase env vars. Check SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.");
  process.exit(1);
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const oauthProvider = new AllAbroadOAuthProvider();

// ── OAuth 2.1 endpoints ───────────────────────────────────────────────────────
// mcpAuthRouter mounts:
//   GET  /.well-known/oauth-authorization-server  — discovery
//   GET  /.well-known/oauth-protected-resource    — resource metadata
//   GET  /oauth/authorize                         — calls provider.authorize()
//   POST /oauth/token                             — code exchange + token refresh
//   POST /oauth/register                          — dynamic client registration
//   POST /oauth/revoke                            — token revocation

app.use(
  mcpAuthRouter({
    provider:        oauthProvider,
    issuerUrl:       new URL(SERVER_URL),
    scopesSupported: ["allabroad:read"],
    resourceName:    "All Abroad",
  })
);

// ── Login form submit (email/password path) ───────────────────────────────────
app.post("/oauth/login", handleLoginSubmit);

// ── Google OAuth completion (called by login.html JS after Google redirect) ───
app.post("/oauth/google-complete", handleGoogleComplete);

// ── MCP endpoint ──────────────────────────────────────────────────────────────
// Each request is stateless: a fresh Server + Transport is created, used,
// and immediately closed. Serverless-safe (Vercel).

app.all("/mcp", requireBearerAuth({ verifier: oauthProvider }), async (req, res) => {
  const mcpToken = req.auth.token;

  // Resolve a fresh Supabase JWT scoped to this user.
  let supabaseJwt;
  try {
    supabaseJwt = await getSupabaseJwtForMcpToken(mcpToken);
  } catch (err) {
    console.error("[allabroad-mcp] JWT resolution failed:", err.message);
    return res.status(401).json({
      error:             "session_expired",
      error_description: "Your All Abroad session has expired. Remove and re-add All Abroad in Claude settings to reconnect.",
    });
  }

  const server = new Server(
    { name: "All Abroad", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name:        t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations ?? {
        readOnlyHint:    true,
        destructiveHint: false,
        openWorldHint:   false,
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const tool = TOOL_BY_NAME[name];

    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      };
    }

    try {
      // Inject the resolved Supabase JWT so auth.js uses it directly.
      const enrichedExtra = { ...extra, resolvedJwt: supabaseJwt };
      return await tool.handler(args ?? {}, enrichedExtra);
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: err.message ?? String(err) }],
      };
    }
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[allabroad-mcp] Transport error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  } finally {
    await server.close().catch(() => {});
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "0.1.0", server: SERVER_URL });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[allabroad-mcp] 🚀 Remote server listening on port ${PORT}`);
  console.log(`[allabroad-mcp] OAuth metadata: ${SERVER_URL}/.well-known/oauth-authorization-server`);
  console.log(`[allabroad-mcp] MCP endpoint:   ${SERVER_URL}/mcp`);
});

export default app; // for Vercel
