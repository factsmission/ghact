import { serveDir, serveFile, Server, Status, STATUS_TEXT } from "./deps.ts";
import { Config } from "../mod.ts";
import { createBadge } from "./log.ts";
import { Job, JobsDataBase } from "./JobsDataBase.ts";
import { indexPage } from "./indexPage.ts";

const encoder = new TextEncoder();

// Incomplete, only what we need
type webhookPayload = {
  repository: {
    full_name: string;
  };
  before: string;
  after: string;
  pusher: {
    name: string;
    email: string;
  };
};

//////////////////////////////////////////////////
// initialize

const GHTOKEN = Deno.env.get("GHTOKEN");

if (!GHTOKEN) throw new Error("Requires GHTOKEN");

const WEBHOOK_SECRET: string | undefined = Deno.env.get("WEBHOOK_SECRET");

export default async function frontend(worker: Worker, config: Config) {
  const db = new JobsDataBase(`${config.workDir}/jobs`);
  const latest =
    db.allJobs().find((j) => j.status === "completed" || j.status === "failed")
      ?.status || "Unknown";
  if (latest === "failed") createBadge("Failed", config.workDir);
  else if (latest === "completed") createBadge("OK", config.workDir);
  else createBadge("Unknown", config.workDir);

  //////////////////////////////////////////////////

  const webhookHandler = async (request: Request) => {
    const requestUrl = new URL(request.url);
    const pathname = requestUrl.pathname;
    if (request.method === "POST") {
      if (pathname === "/update") {
        const from = requestUrl.searchParams.get("from");
        if (!from) {
          return new Response("Query parameter 'from' required", {
            status: Status.BadRequest,
            statusText: STATUS_TEXT[Status.BadRequest],
          });
        }
        const till = requestUrl.searchParams.get("till") || "HEAD";
        // console.log(await getModifiedAfter(from));
        const job: Job = {
          id: (new Date()).toISOString(),
          from,
          till,
          author: {
            name: config.title,
            email: config.email,
          },
        };
        db.addJob(job);
        worker.postMessage(job);
        console.log(
          `Job submitted: ${JSON.stringify(job, undefined, 2)}`,
        );
        return new Response(undefined, {
          status: Status.Accepted,
          statusText: STATUS_TEXT[Status.Accepted],
        });
      }
      if (pathname === "/full_update") {
        console.log("· got full_update request");
        worker.postMessage("FULLUPDATE");
        return new Response(undefined, {
          status: Status.Accepted,
          statusText: STATUS_TEXT[Status.Accepted],
        });
      } else {
        if (WEBHOOK_SECRET && !(await verifySignature(request))) {
          return new Response("Unauthorized", {
            status: Status.Unauthorized,
            statusText: STATUS_TEXT[Status.Unauthorized],
          });
        }
        try {
          const json: webhookPayload | undefined = await request.json();
          const repoName = json?.repository?.full_name;

          console.log("· got webhook from", repoName);

          if (!repoName) {
            return new Response("Invalid Payload", {
              status: Status.BadRequest,
              statusText: STATUS_TEXT[Status.BadRequest],
            });
          }

          if (repoName !== config.sourceRepository) {
            return new Response("Wrong Repository", {
              status: Status.BadRequest,
              statusText: STATUS_TEXT[Status.BadRequest],
            });
          }
          const job: Job = {
            id: (new Date()).toISOString(),
            from: json.before,
            till: json.after,
            author: json.pusher,
          };
          db.addJob(job);
          worker.postMessage(job);
          console.log(
            `Job submitted: ${JSON.stringify(job, undefined, 2)}`,
          );
          return new Response(undefined, {
            status: Status.Accepted,
            statusText: STATUS_TEXT[Status.Accepted],
          });
        } catch (error) {
          return new Response(error, {
            status: Status.InternalServerError,
            statusText: STATUS_TEXT[Status.InternalServerError],
          });
        }
      }
    } else if (pathname === "/status" || pathname === "/status/") {
      console.log("· Got status badge request");
      const response = await serveFile(request, `${config.workDir}/status.svg`);
      response.headers.set("Content-Type", "image/svg+xml");
      return response;
    } else if (pathname === "/jobs.json") {
      const from = Number.parseInt(requestUrl.searchParams.get("from") || "0");
      const till = Number.parseInt(
        requestUrl.searchParams.get("till") || "200",
      );
      const json = JSON.stringify(db.allJobs().slice(from, till), undefined, 2);
      const response = new Response(json);
      response.headers.set("Content-Type", "application/json");
      return response;
    } else if (pathname.startsWith(config.workDir)) {
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
        indexPage(config.title, config.description),
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

  const verifySignature = async (req: Request) => {
    const header = req.headers.get("x-hub-signature-256");
    if (!header) {
      throw new Error("No x-hub-signature-256");
    }
    const payload = JSON.stringify(req.body);
    const parts = header.split("=");
    const sigHex = parts[1];

    const algorithm = { name: "HMAC", hash: { name: "SHA-256" } };

    const keyBytes = encoder.encode(WEBHOOK_SECRET);
    const extractable = false;
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      algorithm,
      extractable,
      ["sign", "verify"],
    );

    const sigBytes = hexToBytes(sigHex);
    const dataBytes = encoder.encode(payload);
    const equal = await crypto.subtle.verify(
      algorithm.name,
      key,
      sigBytes,
      dataBytes,
    );

    return equal;
  };

  function hexToBytes(hex: string) {
    const len = hex.length / 2;
    const bytes = new Uint8Array(len);

    let index = 0;
    for (let i = 0; i < hex.length; i += 2) {
      const c = hex.slice(i, i + 2);
      const b = parseInt(c, 16);
      bytes[index] = b;
      index += 1;
    }

    return bytes;
  }

  //////////////////////////////////////////////////
  // start server

  const server = new Server({ handler: webhookHandler });
  const listener = Deno.listen({ port: 4505, hostname: "0.0.0.0" });
  console.log(`server listening on http://${Deno.env.get("HOSTNAME")}:4505`);

  await server.serve(listener);
}
