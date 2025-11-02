import {
  serveDir,
  serveFile,
  Server,
  STATUS_CODE,
  STATUS_TEXT,
} from "./deps.ts";
import {
  type BasicJob,
  type Config,
  type FullUpdateGatherJob,
  type WebhookJob,
} from "../mod.ts";
import { createBadge } from "./log.ts";
import { JobsDataBase } from "./JobsDataBase.ts";
import { indexPage } from "./indexPage.ts";
import { verifyBasicAuth, verifySignature } from "./helpers.ts";

// Incomplete, only what we need
type webhookPayload = {
  repository: {
    full_name: string;
  };
  before: string;
  after: string;
  pusher: {
    name?: string;
    username?: string;
    email: string;
  };
  commits: {
    added: string[];
    removed: string[];
    modified: string[];
  }[];
};

const WEBHOOK_SECRET: string | undefined = Deno.env.get("WEBHOOK_SECRET");
const ADMIN_PASSWORD: string | undefined = Deno.env.get("ADMIN_PASSWORD");

/**
 * Reserved paths that cannot be overridden by custom handlers
 * @internal
 */
const RESERVED_PATHS = [
  "/",
  "/status",
  "/status/",
  "/update",
  "/full_update",
  "/jobs.json",
  "/actions",
];

/**
 * Type for custom HTTP handler functions
 */
export type HttpHandler = (request: Request) => Response | Promise<Response>;

/**
 * Registration entry for a custom handler with method and path
 * @internal
 */
interface HandlerRegistration {
  path: string;
  method: string;
  handler: HttpHandler;
}

/**
 * uses the WEBHOOK_SECRET environment variable to verify the origin of webhooks.
 * uses the ADMIN_PASSWORD environment variable to authenticate requests to /update and /full_update endpoints (username: admin).
 *
 * example usage:
 * ```ts
 * import { GHActServer, type Config } from "."
 * const config: Config = { ... };
 * // worker must be in separate file, use GHActWorker there
 * const worker = new Worker(import.meta.resolve("./action_worker.ts"), { type: "module" });
 * const server = new GHActServer(worker, config);
 * // Optionally register custom handlers before serving
 * server.addHandler("/webhook", "POST", async (req) => {
 *   return new Response("OK");
 * });
 * await server.serve();
 * ```
 */
export class GHActServer {
  /** @internal */
  private readonly server: Server;
  /** @internal */
  private readonly db: JobsDataBase;
  /** @internal */
  private readonly customHandlers: Map<string, HandlerRegistration> = new Map();
  /** @internal */
  private isServing = false;

  /**
   * Creates new GHActServer. Use the `.serve()` method to start listening.
   *
   * @param worker Worker (e.g. `new Worker(import.meta.resolve("./action_worker.ts"), { type: "module" })`). Worker should be using GHActWorker to handle events properly.
   * @param config Configuration for GHAct
   */
  constructor(
    private readonly worker: Worker,
    private readonly config: Config,
  ) {
    this.db = new JobsDataBase(`${this.config.workDir}/jobs`);
    const latest =
      this.db.allJobs().find((j) =>
        j.status === "completed" || j.status === "failed"
      )
        ?.status || "Unknown";
    if (latest === "failed") {
      createBadge("Failed", this.config.workDir, this.config.title);
    } else if (latest === "completed") {
      createBadge("OK", this.config.workDir, this.config.title);
    } else createBadge("Unknown", this.config.workDir, this.config.title);

    if (
      !this.config.sourceRepositoryUri.includes(this.config.sourceRepository)
    ) {
      console.warn(
        `Warning: config.sourceRepositoryUri (${this.config.sourceRepositoryUri}) might not point to the same repository as config.sourceRepository (${this.config.sourceRepository})`,
      );
    }

    if (!this.worker) throw new Error("Missing worker");

    this.worker.postMessage({ type: "init", config: this.config });
    this.worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === "status") {
        this.db.setStatus(e.data.jobId, e.data.status, e.data.message);
      }
    };

    this.server = new Server({ handler: this.webhookHandler });
  }

  /**
   * Register a custom HTTP handler for a specific path and method.
   *
   * The handler is called exactly as provided - no additional middleware is applied by the framework.
   * Users should compose their own middleware chain before passing the handler.
   *
   * Reserved paths (/, /status, /update, /full_update, /jobs.json, /actions) cannot be overridden.
   * Paths that start with the workDir are also reserved for internal use.
   *
   * This method must be called before `serve()`. Attempting to register handlers after the server
   * has started will throw an error.
   *
   * @param path - The path to register (e.g., "/webhook", "/health"). Must be non-empty and normalized.
   * @param method - The HTTP method (e.g., "GET", "POST"). Case-insensitive.
   * @param handler - The handler function that will be called for matching requests.
   * @throws {Error} If the path is reserved, already registered, invalid, or if called after serve().
   *
   * @example
   * ```ts
   * const server = new GHActServer(worker, config);
   *
   * // Register a simple health check endpoint
   * server.addHandler("/health", "GET", () => new Response("OK"));
   *
   * // Register with custom middleware
   * const authMiddleware = (handler: HttpHandler) => (req: Request) => {
   *   // Check auth...
   *   return handler(req);
   * };
   * server.addHandler("/webhook", "POST", authMiddleware(myHandler));
   *
   * await server.serve();
   * ```
   */
  addHandler(path: string, method: string, handler: HttpHandler): void {
    if (this.isServing) {
      throw new Error(
        "Cannot register handlers after server has started. Call addHandler() before serve().",
      );
    }

    // Validate path
    if (!path || typeof path !== "string") {
      throw new Error("Path must be a non-empty string");
    }

    if (!path.startsWith("/")) {
      throw new Error("Path must start with '/'");
    }

    // Normalize method to uppercase
    const normalizedMethod = method.toUpperCase();

    // Check for reserved paths
    if (RESERVED_PATHS.includes(path)) {
      throw new Error(
        `Path '${path}' is reserved and cannot be overridden. Reserved paths: ${
          RESERVED_PATHS.join(", ")
        }`,
      );
    }

    // Check if path starts with workDir (reserved for internal file serving)
    if (path.startsWith(this.config.workDir)) {
      throw new Error(
        `Paths starting with '${this.config.workDir}' are reserved for internal file serving`,
      );
    }

    // Check for duplicate registration
    const key = `${normalizedMethod}:${path}`;
    if (this.customHandlers.has(key)) {
      throw new Error(
        `Handler already registered for ${normalizedMethod} ${path}`,
      );
    }

    this.customHandlers.set(key, {
      path,
      method: normalizedMethod,
      handler,
    });
  }

  /**
   * Start listenig for requests (webhooks and for the logs interface)
   *
   * e.g. `await server.serve();`
   * @param listener Defaults to Deno.listen({ port: 4505, hostname: "0.0.0.0" })
   */
  serve(
    listener = Deno.listen({ port: 4505, hostname: "0.0.0.0" }),
  ): Promise<void> {
    this.isServing = true;
    return this.server.serve(listener);
  }

  /**
   * @internal
   *
   * Must be an arrow-function for `this` to work correctly when passed as a callback to the Server.
   */
  private readonly webhookHandler = async (request: Request) => {
    const requestUrl = new URL(request.url);
    const pathname = requestUrl.pathname;

    // Check custom handlers first
    const handlerKey = `${request.method}:${pathname}`;
    const customHandler = this.customHandlers.get(handlerKey);
    if (customHandler) {
      return await customHandler.handler(request);
    }

    if (request.method === "POST") {
      if (pathname === "/update") {
        // Check authentication
        if (ADMIN_PASSWORD && !verifyBasicAuth(request, ADMIN_PASSWORD)) {
          return new Response("Unauthorized", {
            status: STATUS_CODE.Unauthorized,
            statusText: STATUS_TEXT[STATUS_CODE.Unauthorized],
            headers: {
              "WWW-Authenticate": 'Basic realm="GHAct Admin", charset="UTF-8"',
            },
          });
        }

        const from = requestUrl.searchParams.get("from");
        if (!from) {
          return new Response("Query parameter 'from' required", {
            status: STATUS_CODE.BadRequest,
            statusText: STATUS_TEXT[STATUS_CODE.BadRequest],
          });
        }
        const till = requestUrl.searchParams.get("till") || "HEAD";
        // console.log(await getModifiedAfter(from));
        const job: BasicJob = {
          id: (new Date()).toISOString(),
          from,
          till,
          author: {
            name: this.config.title,
            email: this.config.email,
          },
        };
        this.db.addJob(job);
        this.worker.postMessage(job);
        console.log(
          `Job submitted: ${JSON.stringify(job, undefined, 2)}`,
        );
        return new Response(undefined, {
          status: STATUS_CODE.Accepted,
          statusText: STATUS_TEXT[STATUS_CODE.Accepted],
        });
      }
      if (pathname === "/full_update") {
        // Check authentication
        if (ADMIN_PASSWORD && !verifyBasicAuth(request, ADMIN_PASSWORD)) {
          return new Response("Unauthorized", {
            status: STATUS_CODE.Unauthorized,
            statusText: STATUS_TEXT[STATUS_CODE.Unauthorized],
            headers: {
              "WWW-Authenticate": 'Basic realm="GHAct Admin", charset="UTF-8"',
            },
          });
        }

        console.log("· got full_update request");
        const job: FullUpdateGatherJob = {
          type: "full_update_gather",
          id: (new Date()).toISOString() + " full update gathering",
          author: {
            name: this.config.title,
            email: this.config.email,
          },
        };
        this.db.addJob(job);
        this.worker.postMessage(job);
        console.log(
          `Job submitted: ${JSON.stringify(job, undefined, 2)}`,
        );
        return new Response(undefined, {
          status: STATUS_CODE.Accepted,
          statusText: STATUS_TEXT[STATUS_CODE.Accepted],
        });
      } else {
        if (
          WEBHOOK_SECRET && !(await verifySignature(request, WEBHOOK_SECRET))
        ) {
          return new Response("Unauthorized", {
            status: STATUS_CODE.Unauthorized,
            statusText: STATUS_TEXT[STATUS_CODE.Unauthorized],
          });
        }
        try {
          const json: webhookPayload | undefined = await request.json();
          const repoName = json?.repository?.full_name;

          console.log("· got webhook from", repoName);

          if (!repoName) {
            return new Response("Invalid Payload", {
              status: STATUS_CODE.BadRequest,
              statusText: STATUS_TEXT[STATUS_CODE.BadRequest],
            });
          }

          if (repoName !== this.config.sourceRepository) {
            return new Response("Wrong Repository", {
              status: STATUS_CODE.BadRequest,
              statusText: STATUS_TEXT[STATUS_CODE.BadRequest],
            });
          }
          const job: WebhookJob = {
            id: (new Date()).toISOString(),
            from: json.before,
            till: json.after,
            author: {
              name: json.pusher.name ?? json.pusher.username ??
                this.config.title,
              email: json.pusher.email,
            },
            files: {
              from: json.before,
              till: json.after,
              added: json.commits
                .flatMap((c) => c.added)
                .map((f) => f.at(0) === "/" ? f.slice(1) : f),
              removed: json.commits
                .flatMap((c) => c.removed)
                .map((f) => f.at(0) === "/" ? f.slice(1) : f),
              modified: json.commits
                .flatMap((c) => c.modified)
                .map((f) => f.at(0) === "/" ? f.slice(1) : f),
            },
          };
          this.db.addJob(job);
          this.worker.postMessage(job);
          console.log(
            `Job submitted: ${JSON.stringify(job, undefined, 2)}`,
          );
          return new Response(undefined, {
            status: STATUS_CODE.Accepted,
            statusText: STATUS_TEXT[STATUS_CODE.Accepted],
          });
        } catch (error) {
          return new Response(error, {
            status: STATUS_CODE.InternalServerError,
            statusText: STATUS_TEXT[STATUS_CODE.InternalServerError],
          });
        }
      }
    } else if (pathname === "/status" || pathname === "/status/") {
      console.log("· Got status badge request");
      const response = await serveFile(
        request,
        `${this.config.workDir}/status.svg`,
      );
      response.headers.set("Content-Type", "image/svg+xml");
      return response;
    } else if (pathname === "/jobs.json") {
      console.log("· Got request for jobs.json");
      const from = Number.parseInt(requestUrl.searchParams.get("from") || "0");
      const till = Number.parseInt(
        requestUrl.searchParams.get("till") || "200",
      );
      const json = JSON.stringify(
        this.db.allJobs(false, [from, till]),
        undefined,
        2,
      );
      const response = new Response(json);
      response.headers.set("Content-Type", "application/json");
      return response;
    } else if (pathname.startsWith(this.config.workDir)) {
      //serving workdir
      const response = await serveDir(request, {
        fsRoot: "/",
        showDirListing: true,
      });
      return response;
    } else if (pathname === "/actions") {
      return await fetch(import.meta.resolve("./actions.html"));
    } else if (pathname === "/") {
      //fallback to directory serving
      const response = new Response(
        indexPage(this.config.title, this.config.description, this.db),
        {
          headers: { "content-type": "text/html" },
        },
      ); /*await fetch(
        import.meta.resolve("../web/index.html"),
      ); */

      return response;
    } else {
      return new Response(null, { status: 404 });
    }
  };
}
