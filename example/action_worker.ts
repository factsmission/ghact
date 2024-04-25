console.log("loading worker");
debugger;

import GhactServiceWorker from "../src/GhactServiceWorker.ts";
import { Job } from "../src/JobsDataBase.ts";
import { config } from "./config.ts";



const _worker = new GhactServiceWorker(self, config, (job: Job) => {
  console.log(`Proudly executing ${JSON.stringify(job, undefined, 2)}`);
});
console.log("loaded worker");
