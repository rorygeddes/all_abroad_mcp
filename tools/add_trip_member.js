// tools/add_trip_member.js
//
// Add an existing All Abroad user to a trip by user_id or email lookup.
// The authenticated user must already be a member of the trip.

import { buildClient, formatSupabaseError } from "../client.js";
import { getJwt } from "../auth.js";

export const addTripMember = {
  name: "add_trip_member",
  description:
    "Add an existing All Abroad user to a trip. Provide either user_id " +
    "(from list_friends) or the user's email address — one must be supplied. " +
    "The authenticated user must already be on the trip. " +
    "For users who are NOT on All Abroad, use invite_trip_member instead.",

  inputSchema: {
    type: "object",
    properties: {
      trip_id: {
        type: "string",
        description: "ID of the trip to add the member to.",
      },
      user_id: {
        type: "string",
        description: "All Abroad user ID of the person to add (preferred if known).",
      },
      email: {
        type: "string",
        description:
          "Email address of the person to add. Used to look up their user_id " +
          "when user_id is not known.",
      },
      role: {
        type: "string",
        enum: ["member", "organizer"],
        description: "Role in the trip. Defaults to 'member'.",
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

      // Resolve target user_id
      let targetUserId = args.user_id ?? null;

      if (!targetUserId && args.email) {
        const { data: profile, error: profileErr } = await db
          .from("aa2_profiles")
          .select("id")
          .eq("email", args.email.toLowerCase().trim())
          .maybeSingle();

        if (profileErr) throw profileErr;
        if (!profile) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `No All Abroad user found with email ${args.email}. ` +
                      "If this person isn't on the app, use invite_trip_member instead.",
              },
            ],
          };
        }
        targetUserId = profile.id;
      }

      if (!targetUserId) {
        return {
          isError: true,
          content: [{ type: "text", text: "Provide either user_id or email." }],
        };
      }

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

      // Check not already a member
      const { data: existing } = await db
        .from("aa2_trip_members")
        .select("id")
        .eq("trip_id", args.trip_id)
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (existing) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, already_member: true }) }],
        };
      }

      // Add the member
      const { data: member, error: insertErr } = await db
        .from("aa2_trip_members")
        .insert({
          trip_id: args.trip_id,
          user_id: targetUserId,
          role:    args.role ?? "member",
        })
        .select("id, trip_id, user_id, role")
        .single();

      if (insertErr) throw insertErr;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, member }, null, 2),
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
