// tools/update_trip.js
//
// Update trip details — title, destination, dates, status, or description.
// Only members of the trip can update it.

import { buildClient, formatSupabaseError } from "../client.js";
import { getJwt } from "../auth.js";

export const updateTrip = {
  name: "update_trip",
  description:
    "Update an existing trip's details: title, destination, country, dates, status, " +
    "or description. Only supply the fields you want to change — others stay the same. " +
    "Use status='confirmed' once flights and accommodation are booked.",

  inputSchema: {
    type: "object",
    properties: {
      trip_id: {
        type: "string",
        description: "ID of the trip to update.",
      },
      title: {
        type: "string",
        description: "New trip title.",
      },
      destination: {
        type: "string",
        description: "New destination name.",
      },
      country: {
        type: "string",
        description: "New country name.",
      },
      start_date: {
        type: "string",
        description: "New start date in YYYY-MM-DD format.",
      },
      end_date: {
        type: "string",
        description: "New end date in YYYY-MM-DD format.",
      },
      description: {
        type: "string",
        description: "New trip description or notes.",
      },
      status: {
        type: "string",
        enum: ["planning", "confirmed", "completed"],
        description: "New trip status.",
      },
    },
    required: ["trip_id"],
    additionalProperties: false,
  },

  annotations: {
    readOnlyHint:    false,
    destructiveHint: false,
    openWorldHint:   false,
  },

  async handler(args, extra) {
    const jwt = await getJwt(extra);
    const db  = buildClient(jwt);

    try {
      const { data: { user }, error: userErr } = await db.auth.getUser();
      if (userErr || !user) throw new Error("Could not resolve authenticated user. Please re-authenticate.");

      // Build the update payload — only include fields that were provided
      const updates = {};
      if (args.title       !== undefined) updates.title       = args.title;
      if (args.destination !== undefined) updates.destination = args.destination;
      if (args.country     !== undefined) updates.country     = args.country;
      if (args.start_date  !== undefined) updates.start_date  = args.start_date;
      if (args.end_date    !== undefined) updates.end_date    = args.end_date;
      if (args.description !== undefined) updates.description = args.description;
      if (args.status      !== undefined) updates.status      = args.status;
      updates.updated_at = new Date().toISOString();

      if (Object.keys(updates).length === 1) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, message: "No fields to update." }) }],
        };
      }

      const { data: trip, error: updateErr } = await db
        .from("aa2_trips")
        .update(updates)
        .eq("id", args.trip_id)
        .select("id, title, destination, country, start_date, end_date, status")
        .single();

      if (updateErr) throw updateErr;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, trip }, null, 2),
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
