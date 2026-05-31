// server.js
//
// All Abroad MCP server — entry point.
//
// v1 (this file):
//   stdio transport, spawned by Claude Desktop or any local MCP client.
//   Set ALLABROAD_JWT in the env block of claude_desktop_config.json.
//
// v2 (remote):
//   StreamableHTTP transport at mcp.allabroad.ai (see remote/server.js).
//   Users add it via Claude Settings → Integrations → Add custom integration.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { listTrips }        from "./tools/list_trips.js";
import { getTripDetails }   from "./tools/get_trip_details.js";
import { listTripIdeas }    from "./tools/list_trip_ideas.js";
import { getTripMembers }   from "./tools/get_trip_members.js";
import { listFriends }      from "./tools/list_friends.js";
import { createTrip }       from "./tools/create_trip.js";
import { addTripMember }    from "./tools/add_trip_member.js";
import { inviteTripMember } from "./tools/invite_trip_member.js";
import { addTripIdea }      from "./tools/add_trip_idea.js";
import { updateTrip }       from "./tools/update_trip.js";

// Registry. To add a tool: write it in tools/, import it above, add here.
const TOOLS = [
  // Read
  listTrips,
  getTripDetails,
  listTripIdeas,
  getTripMembers,
  listFriends,
  // Write
  createTrip,
  addTripMember,
  inviteTripMember,
  addTripIdea,
  updateTrip,
];

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

const server = new Server(
  { name: "All Abroad", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// Advertise tools to the client.
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name:        t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    // Annotations default to read-only; write tools declare their own.
    annotations: t.annotations ?? {
      readOnlyHint:    true,
      destructiveHint: false,
      openWorldHint:   false,
    },
  })),
}));

// Dispatch tool calls.
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;
  const tool = TOOL_BY_NAME[name];
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  }
  try {
    return await tool.handler(args ?? {}, extra);
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: err.message ?? String(err) }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

console.error(
  `[allabroad-mcp] v0.1.0 connected (stdio). tools=${TOOLS.map((t) => t.name).join(",")}`
);
