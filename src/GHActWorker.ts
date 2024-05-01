/// <reference lib="webworker" />

import { type Config, GitRepository, type Job } from "../mod.ts";
import { path, walk } from "./deps.ts";
import { createBadge } from "./log.ts";
import { JobsDataBase } from "./JobsDataBase.ts";

const GHTOKEN = Deno.env.get("GHTOKEN");
if (!GHTOKEN) console.warn("GHTOKEN is missing!");

/**
 * This webworker performs the actual work, including the long running operations on the repository.
 * The jobs are accepted as messages and stored on disk, when the worker is started uncompleted jobs are picked up and executed.
 *
 * The constructor registers a new EventHandler at scope.onmessage to handle incoming messages by GHActServer running in the main thread.
 *
 * uses the GHTOKEN environment variable to authenticate the GitRepository if given.
 *
 * example usage:
 * ```ts
 * /// <reference lib="webworker" />
 * import { GHActWorker, type Job } from ".";
 * const config: Config = { ... };
 * new GHActWorker(self, config, (job: Job, log) => {
 *   log(`Proudly executing ${JSON.stringify(job, undefined, 2)}`);
 * });
 * ```
 */
export class GHActWorker {
  private readonly queue: JobsDataBase;
  private isRunning = false;
  private readonly gitRepository: GitRepository;

  /**
   * Note that the before execution of the jobHandler callback function,
   * GHActWorker will pull the git repository into ${config.workDir}/repository.
   *
   * Any other git actions (e.g. commit of changed files) must be handled by the jobHandler.
   */
  constructor(
    scope: (Window | WorkerGlobalScope) & typeof globalThis,
    private readonly config: Config,
    private readonly jobHandler: (job: Job, log: (msg: string) => void) => void,
  ) {
    console.log("constructing GitRepository");
    this.gitRepository = new GitRepository(
      config.sourceRepositoryUri,
      config.sourceBranch,
      GHTOKEN,
      `${config.workDir}/repository`,
    );
    this.queue = new JobsDataBase(`${config.workDir}/jobs`);
    scope.onmessage = (evt) => {
      const job = evt.data as Job | "FULLUPDATE";
      if (job === "FULLUPDATE") {
        this.gatherJobsForFullUpdate();
      } else {
        //job already added to db by frontend
        if (!this.isRunning) this.startTask();
        else console.log("Already running");
      }
    };
    this.startTask();
  }

  private startTask() {
    this.isRunning = true;
    try {
      this.run();
    } finally {
      this.isRunning = false;
    }
  }

  private run() {
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
      this.gitRepository.updateLocalData();
      try {
        this.queue.setStatus(job, "pending");
        this.jobHandler(job, log);
        this.queue.setStatus(job, "completed");
        log("Completed job successfully");
        createBadge("OK", this.config.workDir);
      } catch (error) {
        this.queue.setStatus(job, "failed");
        log("FAILED JOB");
        log(error);
        if (error.stack) log(error.stack);
        createBadge("Failed", this.config.workDir);
      }
    }
  }

  private async gatherJobsForFullUpdate() {
    this.isRunning = true;
    try {
      console.log("gathering jobs for full update");
      this.gitRepository.updateLocalData();
      const date = (new Date()).toISOString();
      let block = 0;
      const jobs: Job[] = [];
      let files: string[] = [];
      for await (
        const walkEntry of walk(this.gitRepository.directory, {
          exts: undefined,
          includeDirs: false,
          includeSymlinks: false,
        })
      ) {
        if (walkEntry.isFile) {
          files.push(
            walkEntry.path.replace(this.gitRepository.directory, ""),
          );
          if (files.length >= 3000) { // github does not generate diffs if more than 3000 files have been changed
            jobs.push({
              author: {
                name: this.config.title,
                email: this.config.email,
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
      if (files.length > 0) {
        jobs.push({
          author: {
            name: this.config.title,
            email: this.config.email,
          },
          id: `${date} full update: ${(++block).toString(10).padStart(3, "0")}`, // note that the id must begin with a datestamp for correct ordering
          files: {
            modified: files,
          },
        });
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
