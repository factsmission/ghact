import { path } from "./deps.ts";
import { type FullUpdateGatherJob, type Job } from "../mod.ts";

export type JobStatus = {
  job: Job | FullUpdateGatherJob;
  status: "pending" | "failed" | "completed";
  message: string | undefined;
  dir: string;
};

function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

/** A filesystem backed database of jobs and their status. For every job there
 * is a directory where logs might be added. */
export class JobsDataBase {
  constructor(public jobsDir: string) {
    Deno.mkdirSync(jobsDir, { recursive: true });
  }

  addJob(job: Job | FullUpdateGatherJob) {
    const status: JobStatus = {
      job,
      status: "pending",
      message: undefined,
      dir: path.join(this.jobsDir, job.id),
    };
    Deno.mkdirSync(status.dir);
    Deno.writeTextFileSync(
      path.join(status.dir, "status.json"),
      JSON.stringify(status, undefined, 2),
    );
  }

  setStatus(
    job: Job | FullUpdateGatherJob,
    status: "failed" | "completed" | "pending",
    message?: string,
  ) {
    const jobStatus: JobStatus = {
      job,
      status,
      message,
      dir: path.join(this.jobsDir, job.id),
    };
    Deno.writeTextFileSync(
      path.join(jobStatus.dir, "status.json"),
      JSON.stringify(jobStatus, undefined, 2),
    );
  }

  allJobs(oldestFirst = false, pagination?: [number, number]): JobStatus[] {
    const jobDirs = [];
    for (const jobDir of Deno.readDirSync(this.jobsDir)) {
      jobDirs.push(jobDir);
    }
    return jobDirs
      .filter((entry) => entry.isDirectory)
      .sort((a, b) =>
        oldestFirst
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name)
      )
      .slice(pagination?.[0], pagination?.[1])
      .map((jobDir) => {
        const statusFile = path.join(this.jobsDir, jobDir.name, "status.json");
        try {
          return Deno.readTextFileSync(statusFile);
        } catch (err) {
          if (err instanceof Deno.errors.NotFound) {
            console.warn(
              `No statusfile found at ${statusFile}. Please remove directory.`,
            );
            return null;
          } else if (
            (err instanceof Deno.errors.NotADirectory) || err.code === "ENOTDIR"
          ) {
            console.warn(
              `${statusFile} is not a diretory. Please remove the file.`,
            );
            return null;
          } else {
            throw err;
          }
        }
      })
      .filter(notEmpty)
      .map((t) => {
        try {
          return JSON.parse(t) as JobStatus;
        } catch (err) {
          console.warn(`${err} parsing ${t}.`);
          return null;
        }
      })
      .filter(notEmpty);
  }
  pendingJobs() {
    return this.allJobs(true).filter((js) => js.status === "pending");
  }
}
