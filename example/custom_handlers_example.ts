// Example: Custom HTTP Handlers
// This example demonstrates how to add custom HTTP handlers to GHActServer

import { type Config, GHActServer, type HttpHandler } from "../mod.ts";

const config: Config = {
  title: "Custom Handlers Example",
  description: "Example showing custom HTTP handler registration",
  email: "example@example.com",
  sourceRepositoryUri: "https://github.com/factsmission/ghact.git",
  sourceBranch: "main",
  sourceRepository: "factsmission/ghact",
  workDir: "/tmp/ghact-custom-handlers-example",
};

// Mock worker for this example
const worker = new Worker(
  import.meta.resolve("./action_worker.ts"),
  { type: "module" },
);

const server = new GHActServer(worker, config);

// Example 1: Simple health check endpoint
server.addHandler("/health", "GET", () => {
  return new Response(JSON.stringify({ status: "ok", timestamp: Date.now() }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// Example 2: Custom webhook with logging
const loggingMiddleware = (handler: HttpHandler): HttpHandler => {
  return async (req: Request) => {
    const url = new URL(req.url);
    console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname}`);
    const response = await handler(req);
    console.log(`[${new Date().toISOString()}] Response: ${response.status}`);
    return response;
  };
};

const webhookHandler: HttpHandler = async (req) => {
  const data = await req.json();
  console.log("Received webhook:", data);
  return new Response(JSON.stringify({ received: true, data }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
};

server.addHandler("/custom-webhook", "POST", loggingMiddleware(webhookHandler));

// Example 3: Different methods on same path
server.addHandler("/api/resource", "GET", () => {
  return new Response(
    JSON.stringify({ message: "List of resources", resources: [] }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});

server.addHandler("/api/resource", "POST", async (req) => {
  const body = await req.json();
  return new Response(
    JSON.stringify({ message: "Resource created", id: crypto.randomUUID() }),
    {
      status: 201,
      headers: { "Content-Type": "application/json" },
    },
  );
});

// Example 4: Handler with authentication
const authMiddleware = (handler: HttpHandler): HttpHandler => {
  return (req: Request) => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return handler(req);
  };
};

const protectedHandler: HttpHandler = () => {
  return new Response(
    JSON.stringify({ message: "Protected data", secret: "classified" }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};

server.addHandler(
  "/protected",
  "GET",
  authMiddleware(protectedHandler),
);

// Start the server
console.log("Starting server with custom handlers...");
console.log("Available custom endpoints:");
console.log("  GET  /health");
console.log("  POST /custom-webhook");
console.log("  GET  /api/resource");
console.log("  POST /api/resource");
console.log("  GET  /protected (requires Bearer token)");
console.log("\nServer listening on http://0.0.0.0:4505");

await server.serve();
