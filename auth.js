// auth.js
//
// Resolves which Supabase JWT to use for the current tool call.
//
// v1 — local stdio (active now):
//   JWT is pasted into ALLABROAD_JWT in claude_desktop_config.json.
//   Generate it by copying supabase.auth.getSession().session.access_token
//   from the All Abroad app.
//
// v2 — remote HTTP + OAuth (mcp.allabroad.ai):
//   Claude sends a bearer token per the OAuth 2.1/PKCE flow.
//   remote/server.js exchanges it for a fresh Supabase JWT before every
//   tool call and passes it via extra.resolvedJwt — the fastest path.
//
// Callers always use getJwt(extra). v1 falls through immediately;
// v2 uses the pre-resolved JWT injected by the remote server.

export async function getJwt(extra) {
  // ── v2: pre-resolved Supabase JWT from remote server (fastest path) ──────
  // remote/server.js exchanges the MCP Bearer token for a fresh Supabase JWT
  // before invoking the tool, then passes it here via extra.resolvedJwt.
  // RLS enforces per-user data isolation at the DB level.
  if (extra?.resolvedJwt) {
    return extra.resolvedJwt;
  }

  // ── OAuth bearer present in request context ──────────────────────────────
  if (extra?.authInfo?.token) {
    // Shouldn't reach here in v2 flow — server.js resolves first.
    // Kept as a fallback.
    const exchangeUrl = process.env.ALLABROAD_OAUTH_EXCHANGE_URL;
    if (exchangeUrl) {
      const resp = await fetch(exchangeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oauth_token: extra.authInfo.token }),
      });
      if (!resp.ok) throw new Error(`OAuth exchange failed: HTTP ${resp.status}`);
      const { jwt } = await resp.json();
      if (!jwt) throw new Error("OAuth exchange returned no jwt field.");
      return jwt;
    }
  }

  // ── v1: JWT from env (local stdio) ───────────────────────────────────────
  const fromEnv = process.env.ALLABROAD_JWT;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  throw new Error(
    "No JWT available. " +
      "In local stdio mode: add ALLABROAD_JWT to the env block of your " +
      "claude_desktop_config.json. " +
      "In remote mode: complete the OAuth 2.1 flow at https://mcp.allabroad.ai"
  );
}
