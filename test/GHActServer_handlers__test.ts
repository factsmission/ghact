import { assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type Config, GHActServer, type HttpHandler } from "../mod.ts";

// Create a temp dir for testing
const testWorkDir = `/tmp/ghact-test-${Date.now()}`;
Deno.mkdirSync(testWorkDir, { recursive: true });

// Minimal config for testing
const testConfig: Config = {
  title: "Test Server",
  description: "Test Description",
  email: "test@example.com",
  sourceRepositoryUri: "https://github.com/test/repo.git",
  sourceBranch: "main",
  sourceRepository: "test/repo",
  workDir: testWorkDir,
};

// Create a mock worker for testing
function createMockWorker(): Worker {
  // Return a minimal mock worker object
  return {
    postMessage: () => {},
    terminate: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  } as unknown as Worker;
}

Deno.test("addHandler - successfully registers a GET handler", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  // Should not throw
  server.addHandler("/test", "GET", handler);
});

Deno.test("addHandler - successfully registers a POST handler", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  // Should not throw
  server.addHandler("/webhook", "POST", handler);
});

Deno.test("addHandler - allows multiple handlers for different paths", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler1: HttpHandler = () => new Response("Handler 1");
  const handler2: HttpHandler = () => new Response("Handler 2");

  server.addHandler("/path1", "GET", handler1);
  server.addHandler("/path2", "GET", handler2);
});

Deno.test("addHandler - allows different methods for same path", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const getHandler: HttpHandler = () => new Response("GET");
  const postHandler: HttpHandler = () => new Response("POST");

  server.addHandler("/api", "GET", getHandler);
  server.addHandler("/api", "POST", postHandler);
});

Deno.test("addHandler - normalizes method to uppercase", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  // Should work with lowercase
  server.addHandler("/test", "get", handler);

  // Should detect duplicate (normalized to uppercase)
  assertThrows(
    () => {
      server.addHandler("/test", "GET", handler);
    },
    Error,
    "Handler already registered for GET /test",
  );
});

Deno.test("addHandler - rejects reserved path '/'", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  assertThrows(
    () => {
      server.addHandler("/", "GET", handler);
    },
    Error,
    "reserved",
  );
});

Deno.test("addHandler - rejects reserved path '/status'", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  assertThrows(
    () => {
      server.addHandler("/status", "GET", handler);
    },
    Error,
    "reserved",
  );
});

Deno.test("addHandler - rejects reserved path '/update'", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  assertThrows(
    () => {
      server.addHandler("/update", "POST", handler);
    },
    Error,
    "reserved",
  );
});

Deno.test("addHandler - rejects reserved path '/full_update'", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  assertThrows(
    () => {
      server.addHandler("/full_update", "POST", handler);
    },
    Error,
    "reserved",
  );
});

Deno.test("addHandler - rejects reserved path '/jobs.json'", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  assertThrows(
    () => {
      server.addHandler("/jobs.json", "GET", handler);
    },
    Error,
    "reserved",
  );
});

Deno.test("addHandler - rejects reserved path '/actions'", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  assertThrows(
    () => {
      server.addHandler("/actions", "GET", handler);
    },
    Error,
    "reserved",
  );
});

Deno.test("addHandler - rejects paths starting with workDir", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  assertThrows(
    () => {
      server.addHandler(`${testWorkDir}/something`, "GET", handler);
    },
    Error,
    "reserved for internal file serving",
  );
});

Deno.test("addHandler - rejects duplicate registration", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler1: HttpHandler = () => new Response("Handler 1");
  const handler2: HttpHandler = () => new Response("Handler 2");

  server.addHandler("/duplicate", "GET", handler1);

  assertThrows(
    () => {
      server.addHandler("/duplicate", "GET", handler2);
    },
    Error,
    "Handler already registered for GET /duplicate",
  );
});

Deno.test("addHandler - rejects empty path", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  assertThrows(
    () => {
      server.addHandler("", "GET", handler);
    },
    Error,
    "Path must be a non-empty string",
  );
});

Deno.test("addHandler - rejects path not starting with /", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  assertThrows(
    () => {
      server.addHandler("test", "GET", handler);
    },
    Error,
    "Path must start with '/'",
  );
});

Deno.test("addHandler - rejects registration after serve() is called", () => {
  const worker = createMockWorker();
  const server = new GHActServer(worker, testConfig);

  const handler: HttpHandler = () => new Response("OK");

  // Manually set the isServing flag by calling serve but immediately closing
  const listener = Deno.listen({ port: 0, hostname: "127.0.0.1" });
  server.serve(listener);
  listener.close(); // Close immediately to prevent hanging

  // Try to register after serve has been called
  assertThrows(
    () => {
      server.addHandler("/late", "GET", handler);
    },
    Error,
    "Cannot register handlers after server has started",
  );
});
