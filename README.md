# ghact

A framework to act on any (new) file in a Github repository

This provides a `GHActServer` class which:

- listens for github webhooks (`POST` requests) from the configured source repo
- processes the changed files in a webworker set-up using the `GHActWorker`
  class

The server also exposes the follwing paths:

- `/status`: Serves a Badge (svg) to show the current service status
- `/workdir/jobs/`: List of runs
- `/workdir/jobs/[id]/status.json`: Status of run with that id
- `/workdir/jobs/[id]/log.txt`: Log of run with that id
- `/update?from=[from-commit-id]&till=[till-commit-id]`: send a `POST` here to
  update all files modified since from-commit-id up till-commit-id or HEAD if
  not specified. **Requires HTTP Basic Authentication** (username: `admin`,
  password from `ADMIN_PASSWORD` environment variable).
- `/full_update`: send a `POST` here to run the full_update script. Note that
  this will not delete any files (yet). **Requires HTTP Basic Authentication**
  (username: `admin`, password from `ADMIN_PASSWORD` environment variable).

## Authentication

The `/update` and `/full_update` endpoints require HTTP Basic Authentication to
prevent unauthorized access. Configure the password using the `ADMIN_PASSWORD`
environment variable. The username is fixed as `admin`.

> Caution: If `ADMIN_PASSWORD` is not set, these endpoints are accessible
> without authentication. Anyone who can reach the server (including on a local
> network) can trigger updates. For production use, set `ADMIN_PASSWORD` or
> restrict access to the server (firewall, reverse proxy, or network controls).

### Example using curl:

```bash
curl -u admin:your-secret-password -X POST \
  "http://localhost:4505/update?from=HEAD~1&till=HEAD"
```

### Example using fetch:

```ts
const res = await fetch("http://localhost:4505/update?from=HEAD~1&till=HEAD", {
  method: "POST",
  headers: { "Authorization": "Basic " + btoa("admin:your-secret-password") },
});
console.log(res.status, await res.text());
```

## Usage / Documentation

Documentation is available on [deno.land](https://deno.land/x/ghact?doc).

### Example Usage

main.ts:

```ts
import { GHActServer, type Config } from "ghact/mod.ts";
const config: Config = { ... };
// worker must be in separate file, use GHActWorker there
const worker = new Worker(import.meta.resolve("./worker.ts"), { type: "module" });
const server = new GHActServer(worker, config);
await server.serve(); // defaults to port 4505
```

worker.ts:

```ts
/// <reference lib="webworker" />
import { GHActWorker, type Config, type Job } from "ghact/mod.ts";
const config: Config = { ... };
new GHActWorker(self, config, (job: Job, log) => {
  log(`Proudly executing ${JSON.stringify(job, undefined, 2)}`);
});
```

See also the [example folder](example/).

## Custom HTTP Handlers

You can register custom HTTP handlers to expose additional endpoints (e.g.,
webhooks, health checks, metrics, or integration callbacks).

### Basic Example

```ts
import { GHActServer, type Config, type HttpHandler } from "ghact/mod.ts";

const config: Config = { ... };
const worker = new Worker(import.meta.resolve("./worker.ts"), { type: "module" });
const server = new GHActServer(worker, config);

// Register a health check endpoint
server.addHandler("/health", "GET", () => {
  return new Response("OK", { status: 200 });
});

// Register a custom webhook endpoint
server.addHandler("/webhook", "POST", async (req) => {
  const data = await req.json();
  // Process webhook data...
  return new Response("Accepted", { status: 202 });
});

await server.serve();
```

### Middleware Composition

Handlers are called exactly as provided - the framework does not add any
middleware. You should compose your own middleware chain:

```ts
import type { HttpHandler } from "ghact/mod.ts";

// Example authentication middleware
const authMiddleware = (handler: HttpHandler): HttpHandler => {
  return (req: Request) => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }
    return handler(req);
  };
};

// Example logging middleware
const loggingMiddleware = (handler: HttpHandler): HttpHandler => {
  return async (req: Request) => {
    console.log(`${req.method} ${new URL(req.url).pathname}`);
    const response = await handler(req);
    console.log(`Response: ${response.status}`);
    return response;
  };
};

// Compose middlewares and register handler
const myHandler: HttpHandler = async (req) => {
  const body = await req.json();
  // Process request...
  return new Response("OK");
};

server.addHandler(
  "/protected",
  "POST",
  authMiddleware(loggingMiddleware(myHandler)),
);
```

### Multiple HTTP Methods

You can register different handlers for different HTTP methods on the same path:

```ts
server.addHandler("/api", "GET", () => {
  return new Response(JSON.stringify({ message: "GET response" }));
});

server.addHandler("/api", "POST", async (req) => {
  const data = await req.json();
  return new Response(JSON.stringify({ received: data }));
});
```

### Important Considerations

- **Registration timing**: Handlers must be registered before calling
  `server.serve()`. Attempting to register handlers after the server has started
  will throw an error.

- **Reserved paths**: The following paths are reserved and cannot be overridden:
  - `/` (home page)
  - `/status` (status badge)
  - `/update` (admin update endpoint)
  - `/full_update` (admin full update endpoint)
  - `/jobs.json` (jobs list)
  - `/actions` (actions page)
  - Paths starting with `workDir` (internal file serving)

- **Path validation**: Paths must:
  - Be non-empty strings
  - Start with `/`
  - Not conflict with already registered handlers (same path + method)

- **Security**: Custom handlers do not inherit authentication from framework
  endpoints. If your handler needs authentication, implement it in your
  middleware chain or within the handler itself.

- **Observability**: Consider adding logging and metrics within your handlers or
  via middleware for production deployments.
