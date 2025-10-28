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

> Caution: If `ADMIN_PASSWORD` is not set, these endpoints are accessible without
> authentication. Anyone who can reach the server (including on a local network)
> can trigger updates. For production use, set `ADMIN_PASSWORD` or restrict
> access to the server (firewall, reverse proxy, or network controls).

### Example using curl:

```bash
curl -u admin:your-secret-password -X POST \
  "http://localhost:4505/update?from=HEAD~1&till=HEAD"
```

### Example using fetch:
```ts
const res = await fetch("http://localhost:4505/update?from=HEAD~1&till=HEAD", { method: "POST", headers: { "Authorization": "Basic " + btoa("admin:your-secret-password") } });
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
