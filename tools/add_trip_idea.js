// tools/add_trip_idea.js
//
// Add a flight, stay, transport option, or activity idea to a trip.
// Writes to aa2_trip_ideas exactly as the All Abroad app does.

import { buildClient, formatSupabaseError } from "../client.js";
import { getJwt } from "../auth.js";

export const addTripIdea = {
  name: "add_trip_idea",
  description:
    "Add a flight, accommodation, transport option, or activity idea to an All Abroad trip. " +
    "Use category='flight' for flights, 'stay' for hotels/hostels, 'transport' for ground " +
    "travel, or 'other' for activities. Set shortlisted=true for the recommended option. " +
    "Call this after create_trip to populate the trip with researched options.",

  inputSchema: {
    type: "object",
    properties: {
      trip_id: {
        type: "string",
        description: "ID of the trip to add the idea to.",
      },
      title: {
        type: "string",
        description: "Idea title, e.g. 'Montreal (YUL) → Stockholm (ARN) via Copenhagen'.",
      },
      category: {
        type: "string",
        enum: ["flight", "stay", "transport", "other"],
        description: "Category of the idea.",
      },
      est_cost: {
        type: "number",
        description: "Estimated cost in the user's currency.",
      },
      notes: {
        type: "string",
        description: "Extra detail: airline, duration, hostel address, etc.",
      },
      shortlisted: {
        type: "boolean",
        description: "Whether this is the recommended/shortlisted option. Defaults to false.",
      },
    },
    required: ["trip_id", "title"],
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

      const { data: idea, error: insertErr } = await db
        .from("aa2_trip_ideas")
        .insert({
          trip_id:     args.trip_id,
          type:        "place",
          title:       args.title,
          category:    args.category  ?? "other",
          est_cost:    args.est_cost  ?? null,
          notes:       args.notes     ?? null,
          shortlisted: args.shortlisted ?? false,
          created_by:  user.id,
        })
        .select("id, trip_id, title, category, est_cost, shortlisted")
        .single();

      if (insertErr) throw insertErr;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, idea }, null, 2),
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
