/// <reference lib="webworker" />

import { GHActWorker, type Job } from "../mod.ts";

new GHActWorker(self, (job: Job, log) => {
  log(`Proudly executing ${JSON.stringify(job, undefined, 2)}`);
});
console.log("loaded worker");
