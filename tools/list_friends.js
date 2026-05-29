// tools/list_friends.js
//
// List the authenticated user's accepted friends from aa2_friendships.

import { buildClient, formatSupabaseError } from "../client.js";
import { getJwt } from "../auth.js";

export const listFriends = {
  name: "list_friends",
  description:
    "List the user's friends on All Abroad. Use this when the user asks about " +
    "their friends, who they travel with, or wants to know if a specific person " +
    "is in their network. Returns name, email, travel style, and interests for " +
    "each accepted friend.",

  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },

  async handler(args, extra) {
    const jwt = await getJwt(extra);
    const db  = buildClient(jwt);

    try {
      const { data: { user }, error: userErr } = await db.auth.getUser();
      if (userErr || !user) {
        return {
          isError: true,
          content: [{ type: "text", text: "Could not resolve authenticated user." }],
        };
      }

      // Friendships are bidirectional — fetch both directions
      const [
        { data: sent,     error: e1 },
        { data: received, error: e2 },
      ] = await Promise.all([
        db
          .from("aa2_friendships")
          .select("friend_id, aa2_profiles!aa2_friendships_friend_id_fkey(id, name, email, avatar, travel_style, interests)")
          .eq("user_id", user.id)
          .eq("status", "accepted"),
        db
          .from("aa2_friendships")
          .select("user_id, aa2_profiles!aa2_friendships_user_id_fkey(id, name, email, avatar, travel_style, interests)")
          .eq("friend_id", user.id)
          .eq("status", "accepted"),
      ]);

      if (e1) throw e1;
      if (e2) throw e2;

      const sentFriends     = (sent     ?? []).map((r) => r.aa2_profiles);
      const receivedFriends = (received ?? []).map((r) => r.aa2_profiles);

      // Deduplicate by id
      const seen = new Set();
      const allFriends = [...sentFriends, ...receivedFriends].filter(
        (f) => f && !seen.has(f.id) && seen.add(f.id)
      );

      const compact = allFriends.map((f) => ({
        id:           f.id,
        name:         f.name,
        email:        f.email,
        travel_style: f.travel_style,
        interests:    f.interests ?? [],
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: compact.length, friends: compact }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: formatSupabaseError(err) }],
      };
    }
  },
};
