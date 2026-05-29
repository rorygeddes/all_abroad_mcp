// tools/get_trip_details.js
//
// Deep dive into a single trip: basic info, members with availability,
// activities, saved flights, and budget total.
// Tables: aa2_trips, aa2_trip_members, aa2_profiles, aa2_activities,
//         aa2_trip_flights, aa2_trip_budget_items

import { buildClient, formatSupabaseError } from "../client.js";
import { getJwt } from "../auth.js";

export const getTripDetails = {
  name: "get_trip_details",
  description:
    "Get full details for a specific All Abroad trip: destination, dates, " +
    "members and their availability, activities on the itinerary, saved flights, " +
    "and budget summary. Use this when the user asks about a specific trip — " +
    "what's planned, who's coming, when people are available, or how much it costs. " +
    "Requires a trip_id (get it from list_trips first).",

  inputSchema: {
    type: "object",
    properties: {
      trip_id: {
        type: "string",
        description: "The UUID of the trip to fetch.",
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
      // Core trip row
      const { data: trip, error: tErr } = await db
        .from("aa2_trips")
        .select("*")
        .eq("id", args.trip_id)
        .single();

      if (tErr || !trip) {
        return {
          isError: true,
          content: [{ type: "text", text: `Trip ${args.trip_id} not found or you don't have access.` }],
        };
      }

      // Members + profiles
      const { data: memberRows } = await db
        .from("aa2_trip_members")
        .select("role, available_dates, confirmed_dates, aa2_profiles(id, name, email, avatar, travel_style)")
        .eq("trip_id", args.trip_id);

      const members = (memberRows ?? []).map((m) => ({
        name:             m.aa2_profiles?.name,
        email:            m.aa2_profiles?.email,
        role:             m.role,
        travel_style:     m.aa2_profiles?.travel_style,
        available_dates:  m.available_dates ?? [],
        confirmed_dates:  m.confirmed_dates ?? false,
      }));

      // Activities
      const { data: activities } = await db
        .from("aa2_activities")
        .select("id, title, category, date, time, location, price_range, booked, booking_url")
        .eq("trip_id", args.trip_id)
        .order("date", { ascending: true });

      // Saved flights
      const { data: flights } = await db
        .from("aa2_trip_flights")
        .select("airline, flight_number, departure_code, departure_time, arrival_code, arrival_time, price, currency, direction, stops")
        .eq("trip_id", args.trip_id)
        .order("saved_at", { ascending: true });

      // Budget items
      const { data: budgetItems } = await db
        .from("aa2_trip_budget_items")
        .select("category, label, amount, currency, per_person, notes")
        .eq("trip_id", args.trip_id);

      const budgetTotal = (budgetItems ?? []).reduce((sum, b) => {
        const amount = Number(b.amount ?? 0);
        return sum + (b.per_person ? amount * members.length : amount);
      }, 0);

      const result = {
        id:          trip.id,
        title:       trip.title,
        destination: trip.destination,
        country:     trip.country,
        start_date:  trip.start_date,
        end_date:    trip.end_date,
        status:      trip.status,
        description: trip.description,
        members,
        activities:  (activities ?? []).map((a) => ({
          id:          a.id,
          title:       a.title,
          category:    a.category,
          date:        a.date,
          time:        a.time,
          location:    a.location,
          price_range: a.price_range,
          booked:      a.booked,
          booking_url: a.booking_url,
        })),
        flights:     (flights ?? []).map((f) => ({
          airline:        f.airline,
          flight_number:  f.flight_number,
          route:          `${f.departure_code} → ${f.arrival_code}`,
          departure_time: f.departure_time,
          arrival_time:   f.arrival_time,
          stops:          f.stops,
          price:          f.price,
          currency:       f.currency,
          direction:      f.direction,
        })),
        budget: {
          items:        budgetItems ?? [],
          estimated_total: Math.round(budgetTotal * 100) / 100,
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: formatSupabaseError(err) }],
      };
    }
  },
};
