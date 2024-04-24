/// <reference lib="webworker" />

/* This webworker performs the actual work, including the long running operations on the repository.
* The jobs are accepted as messages and stored on disk, when the worker is started uncompleted jobs are picked up and exxecuted.

*/
import { path, walk } from "./deps.ts";
import { config } from "../config/config.ts";
import { createBadge } from "./log.ts";
import { type Job, JobsDataBase } from "./JobsDataBase.ts";
import { updateLocalData } from "./repoActions.ts";

export type GhactConfig = {
  sourceBranch: string;
  sourceRepository: string;
  sourceRepositoryUri: string;
  workDir: string;
};

export default class GhactServiceWorker {
  queue: JobsDataBase;
  isRunning = false;
  constructor(
    scope: WorkerGlobalScope & typeof globalThis,
    config: GhactConfig,
    protected execute: (job: Job) => void,
  ) {
    this.queue = new JobsDataBase(`${config.workDir}/jobs`);
    scope.onmessage = (evt) => {
      const job = evt.data as Job | "FULLUPDATE";
      if (job === "FULLUPDATE") {
        this.gatherJobsForFullUpdate();
      } else {
        if (!this.isRunning) this.startTask();
        else console.log("Already running");
      }
    };
    this.startTask();
  }
  startTask() {
    this.isRunning = true;
    try {
      this.run();
    } finally {
      this.isRunning = false;
    }
  }
  run() {
    while (this.queue.pendingJobs().length > 0) {
      const jobStatus = this.queue.pendingJobs()[0];
      const job = jobStatus.job;
      const log = (msg: string) => {
        Deno.writeTextFileSync(
          path.join(jobStatus.dir, "log.txt"),
          msg + "\n",
          {
            append: true,
          },
        );
      };
      try {
        this.execute(job);
        this.queue.setStatus(job, "completed");
        log("Completed transformation successfully");
        createBadge("OK");
      } catch (error) {
        this.queue.setStatus(job, "failed");
        log("FAILED TRANSFORMATION");
        log(error);
        if (error.stack) log(error.stack);
        createBadge("Failed");
      }
    }
  }

  async gatherJobsForFullUpdate() {
    this.isRunning = true;
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
        this.queue.addJob(j);
      });
      console.log(`succesfully created full-update jobs (${block} jobs)`);
    } catch (error) {
      console.error("Could not create full-update jobs\n" + error);
    } finally {
      this.isRunning = false;
      this.startTask();
    }
  }
}
