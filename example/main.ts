import { GHActServer } from "../mod.ts";
import { config } from "./config.ts";

const worker = new Worker(import.meta.resolve("./action_worker.ts"), {
  type: "module",
});
const server = new GHActServer(worker, config);
await server.serve();
