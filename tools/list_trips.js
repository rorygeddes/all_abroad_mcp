// tools/list_trips.js
//
// List the authenticated user's trips from aa2_trips via aa2_trip_members.
// Includes destination, dates, status, and member count.

import { buildClient, formatSupabaseError } from "../client.js";
import { getJwt } from "../auth.js";

export const listTrips = {
  name: "list_trips",
  description:
    "List the user's All Abroad trips. Use this when the user asks about their " +
    "upcoming trips, past trips, where they're going, or trip status. " +
    "Returns all trips the authenticated user is a member of, with destination, " +
    "dates, status (planning / confirmed / completed), and number of members. " +
    "For detailed info about a single trip (activities, ideas, flights), " +
    "call get_trip_details instead.",

  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description:
          "Filter by trip status. Options: 'planning', 'confirmed', 'completed'. " +
          "Omit to return all trips.",
        enum: ["planning", "confirmed", "completed"],
      },
    },
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
      // Resolve authenticated user
      const { data: { user }, error: userErr } = await db.auth.getUser();
      if (userErr || !user) {
        return {
          isError: true,
          content: [{ type: "text", text: "Could not resolve authenticated user. Please re-authenticate." }],
        };
      }

      // Get trip IDs where user is a member
      const { data: memberRows, error: mErr } = await db
        .from("aa2_trip_members")
        .select("trip_id")
        .eq("user_id", user.id);

      if (mErr) throw mErr;
      if (!memberRows?.length) {
        return {
          content: [{ type: "text", text: JSON.stringify({ count: 0, trips: [] }, null, 2) }],
        };
      }

      const tripIds = memberRows.map((r) => r.trip_id);

      // Fetch trips
      let query = db
        .from("aa2_trips")
        .select("id, title, destination, country, start_date, end_date, status, created_by, created_at")
        .in("id", tripIds)
        .order("start_date", { ascending: true });

      if (args.status) {
        query = query.eq("status", args.status);
      }

      const { data: trips, error: tErr } = await query;
      if (tErr) throw tErr;

      // Get member counts per trip
      const { data: allMembers } = await db
        .from("aa2_trip_members")
        .select("trip_id")
        .in("trip_id", tripIds);

      const memberCount = {};
      for (const m of allMembers ?? []) {
        memberCount[m.trip_id] = (memberCount[m.trip_id] ?? 0) + 1;
      }

      const compact = (trips ?? []).map((t) => ({
        id:           t.id,
        title:        t.title,
        destination:  t.destination,
        country:      t.country,
        start_date:   t.start_date,
        end_date:     t.end_date,
        status:       t.status,
        member_count: memberCount[t.id] ?? 1,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: compact.length, trips: compact }, null, 2),
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
