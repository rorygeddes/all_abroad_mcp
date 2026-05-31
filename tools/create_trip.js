// tools/create_trip.js
//
// Create a new trip and automatically add the authenticated user as organizer.

import { buildClient, formatSupabaseError } from "../client.js";
import { getJwt } from "../auth.js";

export const createTrip = {
  name: "create_trip",
  description:
    "Create a new All Abroad trip. The authenticated user is automatically added " +
    "as the organizer. Returns the new trip_id to use with add_trip_member and " +
    "add_trip_idea. Call this when the user wants to start planning a trip.",

  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Trip title, e.g. 'Stockholm, Sweden'.",
      },
      destination: {
        type: "string",
        description: "City or region name, e.g. 'Stockholm'.",
      },
      country: {
        type: "string",
        description: "Country name, e.g. 'Sweden'.",
      },
      start_date: {
        type: "string",
        description: "Departure date in YYYY-MM-DD format.",
      },
      end_date: {
        type: "string",
        description: "Return date in YYYY-MM-DD format.",
      },
      description: {
        type: "string",
        description: "Short trip description or notes.",
      },
    },
    required: ["title"],
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

      // Insert the trip
      const { data: trip, error: tripErr } = await db
        .from("aa2_trips")
        .insert({
          title:       args.title,
          destination: args.destination  ?? null,
          country:     args.country      ?? null,
          start_date:  args.start_date   ?? null,
          end_date:    args.end_date     ?? null,
          description: args.description  ?? null,
          status:      "planning",
          created_by:  user.id,
        })
        .select("id, title, destination, country, start_date, end_date, status")
        .single();

      if (tripErr) throw tripErr;

      // Add creator as organizer
      const { error: memberErr } = await db
        .from("aa2_trip_members")
        .insert({ trip_id: trip.id, user_id: user.id, role: "organizer" });

      if (memberErr) throw memberErr;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, trip_id: trip.id, trip }, null, 2),
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
