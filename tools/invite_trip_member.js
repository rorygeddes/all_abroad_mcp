// tools/invite_trip_member.js
//
// Add a non-app user to a trip as a named placeholder.
// Inserts into aa2_trip_member_placeholders so they appear in the trip's
// member list while they don't have an All Abroad account yet.

import { buildClient, formatSupabaseError } from "../client.js";
import { getJwt } from "../auth.js";

export const inviteTripMember = {
  name: "invite_trip_member",
  description:
    "Add a person who is NOT on All Abroad to a trip as a named placeholder. " +
    "They will appear in the group but won't have app access until they sign up. " +
    "Use this for friends like 'Finn' who aren't on the app yet. " +
    "For users who already have All Abroad accounts, use add_trip_member instead.",

  inputSchema: {
    type: "object",
    properties: {
      trip_id: {
        type: "string",
        description: "ID of the trip.",
      },
      name: {
        type: "string",
        description: "Display name of the person to add, e.g. 'Finn'.",
      },
    },
    required: ["trip_id", "name"],
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

      // Check caller is on the trip
      const { data: callerMember, error: callerErr } = await db
        .from("aa2_trip_members")
        .select("id")
        .eq("trip_id", args.trip_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (callerErr) throw callerErr;
      if (!callerMember) {
        return {
          isError: true,
          content: [{ type: "text", text: "You are not a member of this trip." }],
        };
      }

      const { data: placeholder, error: insertErr } = await db
        .from("aa2_trip_member_placeholders")
        .insert({
          trip_id:      args.trip_id,
          display_name: args.name.trim(),
        })
        .select("id, trip_id, display_name")
        .single();

      if (insertErr) throw insertErr;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, placeholder }, null, 2),
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
