/// <reference lib="webworker" />

import { GHActWorker, type Job } from "../mod.ts";
import { config } from "./config.ts";

const _worker = new GHActWorker(self, config, (job: Job, log) => {
  log(`Proudly executing ${JSON.stringify(job, undefined, 2)}`);
});
console.log("loaded worker");
