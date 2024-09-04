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
import { verifySignature } from "./helpers.ts";

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

/**
 * uses the WEBHOOK_SECRET environment variable to verify the origin of webhooks.
 *
 * example usage:
 * ```ts
 * import { GHActServer, type Config } from "."
 * const config: Config = { ... };
 * // worker must be in separate file, use GHActWorker there
 * const worker = new Worker(import.meta.resolve("./action_worker.ts"), { type: "module" });
 * const server = new GHActServer(worker, config);
 * await server.serve();
 * ```
 */
export class GHActServer {
  /** @internal */
  private readonly server: Server;
  /** @internal */
  private readonly db: JobsDataBase;

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

    this.server = new Server({ handler: this.webhookHandler });
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
    if (request.method === "POST") {
      if (pathname === "/update") {
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
