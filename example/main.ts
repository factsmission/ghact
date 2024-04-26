import frontend from "../src/frontend.tsx";
import { config } from "./config.ts";
console.log(new URL("./action_worker.ts", import.meta.url).href);
const worker = new Worker(
  new URL("./action_worker.ts", import.meta.url).href,
  {
    type: "module",
  },
);
await frontend(worker, config);
