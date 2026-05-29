// client.js
//
// Thin Supabase client wrapper for All Abroad MCP tools.
// Holds NO secrets. Forwards the resolved user JWT on every request so
// RLS on all aa2_* tables enforces per-user data isolation exactly as it
// does in the app.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.SUPABASE_URL  ?? "https://kthqklefebzwuwnmefqb.supabase.co";
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0aHFrbGVmZWJ6d3V3bm1lZnFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEzNDc4NzksImV4cCI6MjA2NjkyMzg3OX0.XenAJSSTTi0myD7yr1K1goIE40jPAAE0E3vSLBP-1sM";

/**
 * Build a Supabase client bound to a specific user's JWT.
 * Called per-tool-invocation after auth.js resolves the token.
 * RLS on all aa2_* tables restricts rows to that user's data automatically.
 */
export function buildClient(jwt) {
  if (!jwt) {
    throw new Error(
      "No JWT available. Set ALLABROAD_JWT in claude_desktop_config.json " +
        "(local stdio mode) or complete the OAuth flow (remote mode)."
    );
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-AllAbroad-Client": "mcp/0.1.0",
      },
    },
    auth: {
      // We manage auth ourselves — no auto-refresh needed.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Wrap a Supabase error into something a Claude tool result can present cleanly.
 */
export function formatSupabaseError(err) {
  if (!err) return "Unknown error";
  const msg = err.message ?? String(err);
  const code = err.code ? ` (${err.code})` : "";
  return `All Abroad data error${code}: ${msg}`;
}
