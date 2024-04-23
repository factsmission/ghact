/// <reference lib="webworker" />

/* This webworker performs the actual work, including the long running operations on the repository.
* The jobs are accepted as messages and stored on disk, when the worker is started uncompleted jobs are picked up and exxecuted.

*/
import { existsSync, path, walk } from "./deps.ts";
import { config } from "../config/config.ts";
import { createBadge } from "./log.ts";
import { type Job, JobsDataBase } from "./JobsDataBase.ts";
import { getModifiedAfter, updateLocalData } from "./repoActions.ts";
import { gg2rdf } from "./gg2rdf.ts";

const GHTOKEN = Deno.env.get("GHTOKEN");

export class GhactServiceWorker {
  constructor(config: )
}

const queue = new JobsDataBase(`${config.workDir}/jobs`);

let isRunning = false;

startTask();

self.onmessage = (evt) => {
  const job = evt.data as Job | "FULLUPDATE";
  if (job === "FULLUPDATE") {
    gatherJobsForFullUpdate();
  } else {
    if (!isRunning) startTask();
    else console.log("Already running");
  }
};

function startTask() {
  isRunning = true;
  try {
    run();
  } finally {
    isRunning = false;
  }
}

async function gatherJobsForFullUpdate() {
  isRunning = true;
  try {
    console.log("gathering jobs for full update");
    updateLocalData("source");
    const date = (new Date()).toISOString();
    let block = 0;
    const jobs: Job[] = [];
    let files: string[] = [];
    for await (
      const walkEntry of walk(`${config.workDir}/repo/source/`, {
        exts: ["xml"],
        includeDirs: false,
        includeSymlinks: false,
      })
    ) {
      if (walkEntry.isFile && walkEntry.path.endsWith(".xml")) {
        files.push(
          walkEntry.path.replace(`${config.workDir}/repo/source/`, ""),
        );
        if (files.length >= 3000) { // github does not generate diffs if more than 3000 files have been changed
          jobs.push({
            author: {
              name: "GG2RDF Service",
              email: "gg2rdf@plazi.org",
            },
            id: `${date} full update: ${
              (++block).toString(10).padStart(3, "0")
            }`, // note that the id must begin with a datestamp for correct ordering
            files: {
              modified: files,
            },
          });
          files = [];
        }
      } else {
        console.log("skipped", walkEntry.path);
      }
    }
    jobs.forEach((j) => {
      j.id += ` of ${block.toString(10).padStart(3, "0")}`;
      queue.addJob(j);
    });
    console.log(`succesfully created full-update jobs (${block} jobs)`);
  } catch (error) {
    console.error("Could not create full-update jobs\n" + error);
  } finally {
    isRunning = false;
    startTask();
  }
}

function run(execute: (job: Job) => void) {
  while (queue.pendingJobs().length > 0) {
    const jobStatus = queue.pendingJobs()[0];
    const job = jobStatus.job;
    const log = (msg: string) => {
      Deno.writeTextFileSync(path.join(jobStatus.dir, "log.txt"), msg + "\n", {
        append: true,
      });
    };
    try {
      execute(job)
      queue.setStatus(job, "completed");
      log("Completed transformation successfully");
      createBadge("OK");
    } catch (error) {
      queue.setStatus(job, "failed");
      log("FAILED TRANSFORMATION");
      log(error);
      if (error.stack) log(error.stack);
      createBadge("Failed");
    }
  }
}
