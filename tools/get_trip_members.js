// tools/get_trip_members.js
//
// Get members of a trip with their availability windows.
// Useful for finding overlapping dates when planning group trips.

import { buildClient, formatSupabaseError } from "../client.js";
import { getJwt } from "../auth.js";

export const getTripMembers = {
  name: "get_trip_members",
  description:
    "Get the members of a trip and their available dates. Use this when the user " +
    "asks who's going on a trip, when everyone is free, which dates overlap, or " +
    "whether specific people have confirmed their dates. " +
    "Returns each member's name, role, available dates, and confirmation status. " +
    "Requires a trip_id (get it from list_trips).",

  inputSchema: {
    type: "object",
    properties: {
      trip_id: {
        type: "string",
        description: "The UUID of the trip.",
      },
    },
    required: ["trip_id"],
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
      const { data: memberRows, error } = await db
        .from("aa2_trip_members")
        .select("role, available_dates, confirmed_dates, aa2_profiles(id, name, full_name, email, avatar, travel_style, interests)")
        .eq("trip_id", args.trip_id);

      if (error) throw error;

      const members = (memberRows ?? []).map((m) => ({
        name:             m.aa2_profiles?.name || m.aa2_profiles?.full_name,
        email:            m.aa2_profiles?.email,
        role:             m.role,
        travel_style:     m.aa2_profiles?.travel_style,
        interests:        m.aa2_profiles?.interests ?? [],
        available_dates:  m.available_dates ?? [],
        confirmed_dates:  m.confirmed_dates ?? false,
      }));

      // Compute overlapping available dates across all members
      const allDateSets = members
        .filter((m) => m.available_dates.length > 0)
        .map((m) => new Set(m.available_dates));

      let overlapping = [];
      if (allDateSets.length > 0) {
        const first = [...allDateSets[0]];
        overlapping = first.filter((d) => allDateSets.every((s) => s.has(d))).sort();
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                member_count: members.length,
                members,
                overlapping_available_dates: overlapping,
              },
              null,
              2
            ),
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
