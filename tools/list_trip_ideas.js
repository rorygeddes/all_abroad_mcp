// tools/list_trip_ideas.js
//
// List trip ideas / saved clips for a trip from aa2_trip_ideas.
// Includes web-clipped items, manually uploaded spots, and TripAdvisor saves.

import { buildClient, formatSupabaseError } from "../client.js";
import { getJwt } from "../auth.js";

export const listTripIdeas = {
  name: "list_trip_ideas",
  description:
    "List the saved ideas and clipped items for a specific trip. " +
    "Use this when the user asks what they've saved for a trip, what places or " +
    "restaurants they're considering, what's on their wishlist, or what they " +
    "clipped from the web. Returns title, category, estimated cost, and shortlist status. " +
    "Requires a trip_id (get it from list_trips).",

  inputSchema: {
    type: "object",
    properties: {
      trip_id: {
        type: "string",
        description: "The UUID of the trip.",
      },
      category: {
        type: "string",
        description:
          "Filter by category, e.g. 'food', 'stay', 'experience', 'transport'. Omit for all.",
      },
      shortlisted_only: {
        type: "boolean",
        description: "If true, only return shortlisted ideas. Default false.",
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
      let query = db
        .from("aa2_trip_ideas")
        .select("id, title, category, type, est_cost, shortlisted, is_booked, source_url, photo_url, created_at")
        .eq("trip_id", args.trip_id)
        .order("created_at", { ascending: false });

      if (args.category) {
        query = query.eq("category", args.category);
      }
      if (args.shortlisted_only) {
        query = query.eq("shortlisted", true);
      }

      const { data, error } = await query;
      if (error) throw error;

      const ideas = (data ?? []).map((i) => ({
        id:          i.id,
        title:       i.title,
        category:    i.category,
        type:        i.type,
        est_cost:    i.est_cost,
        shortlisted: i.shortlisted ?? false,
        is_booked:   i.is_booked ?? false,
        source_url:  i.source_url,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: ideas.length, ideas }, null, 2),
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
