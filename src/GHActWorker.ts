/// <reference lib="webworker" />

import {
  type Config,
  type FullUpdateGatherJob,
  type FullUpdateJob,
  GitRepository,
  type Job,
} from "../mod.ts";
import { path, walk } from "./deps.ts";
import { createBadge, LogFn } from "./log.ts";
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
 * new GHActWorker(self, (job: Job, log) => {
 *   log(`Proudly executing ${JSON.stringify(job, undefined, 2)}`);
 * });
 * ```
 */
export class GHActWorker {
  /** @internal */
  private queue?: JobsDataBase;
  /** @internal */
  private config?: Config;
  /** @internal */
  private isRunning = false;
  /**
   * The source-repository
   */
  gitRepository?: GitRepository;

  /**
   * Note that the before execution of the jobHandler callback function,
   * GHActWorker will pull the git repository into ${config.workDir}/repository.
   *
   * Any other git actions (e.g. commit of changed files) must be handled by the jobHandler.
   */
  constructor(
    scope: (Window | WorkerGlobalScope) & typeof globalThis,
    private readonly jobHandler: (
      job: Job,
      log: LogFn,
    ) => void | Promise<void> | string | Promise<string>,
  ) {
    scope.onmessage = async (e: MessageEvent) => {
      if (e.data.type === "init") {
        this.config = e.data.config;
        this.gitRepository = new GitRepository(
          this.config!.sourceRepositoryUri,
          this.config!.sourceBranch,
          GHTOKEN,
          `${this.config!.workDir}/repository`,
        );
        this.queue = new JobsDataBase(`${this.config!.workDir}/jobs`);
        console.log("Worker initialized with config:", this.config);
        // Automatically start processing any pending jobs on initialization
        if (!this.isRunning) await this.startTask();
        return;
      }

      if (!this.config || !this.queue || !this.gitRepository) {
        console.error("Worker not initialized. Ignoring message:", e.data);
        return;
      }

      // Jobs are queued by the server, this message is just a trigger
      if (!this.isRunning) await this.startTask();
      else console.log("Already running");
    };
  }

  /** @internal */
  private async startTask() {
    if (this.isRunning) {
      console.warn("Already running");
      return;
    }
    if (!this.config || !this.queue) {
      console.error("Cannot start task: worker not initialized.");
      return;
    }
    this.isRunning = true;
    try {
      await this.run();
    } finally {
      this.isRunning = false;
    }
  }

  /** @internal */
  private async run() {
    while (this.queue!.pendingJobs().length > 0) {
      const jobStatus = this.queue!.pendingJobs()[0];
      const job = jobStatus.job;

      const log = new LogFn(path.join(jobStatus.dir, "log.txt"), true);

      try {
        this.queue!.setStatus(job, "pending");
        log(`=== Starting job ${job.id} ===`);
        if ("type" in job && job.type === "full_update_gather") {
          await this.gatherJobsForFullUpdate(job, log);
          // gatherJobsForFullUpdate handles setting job status itself
        } else {
          await this.gitRepository!.updateLocalData(log);
          const message = await this.jobHandler(job, log) as string | undefined;
          this.queue!.setStatus(job, "completed", message);
          log(`=== Sucessfully completed job ${job.id} ===`);
          createBadge("OK", this.config!.workDir, this.config!.title);
        }
      } catch (error) {
        this.queue!.setStatus(job, "failed", "" + error);
        log(`=== Failed job ${job.id} ===\n=== Error: ===`);
        log(error);
        if (error.stack) log(error.stack);
        createBadge("Failed", this.config!.workDir, this.config!.title);
      }
    }
  }

  /** @internal */
  private async gatherJobsForFullUpdate(job: FullUpdateGatherJob, log: LogFn) {
    this.isRunning = true;
    try {
      await this.gitRepository!.updateLocalData();
      const date = job.id.split(" ")[0];
      let block = 0;
      const jobs: FullUpdateJob[] = [];
      let files: string[] = [];
      for await (
        const walkEntry of walk(this.gitRepository!.directory, {
          exts: undefined,
          includeDirs: false,
          includeSymlinks: false,
        })
      ) {
        if (walkEntry.isFile) {
          files.push(
            // this.gitRepository.directory does not contain a trailing /, but we want our filenames not to begin with one
            walkEntry.path.replace(this.gitRepository!.directory + "/", ""),
          );
          if (files.length >= 3000) { // github does not generate diffs if more than 3000 files have been changed
            jobs.push({
              author: {
                name: this.config!.title,
                email: this.config!.email,
              },
              id: `${date} full update: ${
                (++block).toString(10).padStart(3, "0")
              }`, // note that the id must begin with a datestamp for correct ordering
              files: { modified: files },
            });
            files = [];
          }
        } else {
          log(`skipped ${walkEntry.path}`);
        }
      }
      if (files.length > 0) {
        jobs.push({
          author: {
            name: this.config!.title,
            email: this.config!.email,
          },
          id: `${date} full update: ${(++block).toString(10).padStart(3, "0")}`, // note that the id must begin with a datestamp for correct ordering
          files: { modified: files },
        });
      }
      jobs.forEach((j) => {
        j.id += ` of ${block.toString(10).padStart(3, "0")}`;
        this.queue!.addJob(j);
      });
      log(`Created ${block} jobs for full update`);
      log(`=== Sucessfully completed job ${job.id} ===`);
      this.queue!.setStatus(job, "completed");
    } catch (error) {
      this.queue!.setStatus(job, "failed", "" + error);
      log(`=== Failed job ${job.id} ===\n=== Error: ===`);
      log(error);
      if (error.stack) log(error.stack);
    } finally {
      this.isRunning = false;
      await this.startTask();
    }
  }
}
