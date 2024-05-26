export { GHActServer } from "./src/GHActServer.ts";
export { GHActWorker } from "./src/GHActWorker.ts";
export { GitRepository } from "./src/GitRepository.ts";
export { combineCommandOutputs, LogFn } from "./src/log.ts";

/**
 * Options for configuring GHAct
 */
export interface Config {
  // Note: this is an interface (instead of a type alias) to enable documentation of the properties

  /**
   * Shown on the web-interface and used as default job-author
   */
  title: string;
  /**
   * Shown on the web-interface
   */
  description: string;
  /**
   * Default job-author-email
   *
   * e.g `"ghact@example.org"`
   */
  email: string;
  /**
   * The uri of the repository that will be cloned into ${workDir}/repository
   *
   * Note that authentification via token is only possible for https-uris.
   *
   * e.g `"https://github.com/factsmission/ghact.git"`
   */
  sourceRepositoryUri: string;
  /** Branch to checkout
   *
   * e.g `"main"`
   */
  sourceBranch: string;
  /**
   * Incoming webhooks are compared to this repository name and only processed if it matches
   *
   * e.g `"factsmission/ghact"`
   */
  sourceRepository: string;
  /**
   * Where to store data, logs, jobs etc.
   *
   * e.g. `"/workdir"`
   */
  workDir: string;
}

/**
 * added, removed and modified contiain the respective changed files as a list of paths (strings)
 */
export interface ChangeSummary {
  /** commit hash of commit since which changes are considered */
  from: string;
  /** commit hash of commit up until which changes were considered */
  till: string;
  /** files added in the requested span of commits */
  added: string[];
  /** files removed in the requested span of commits */
  removed: string[];
  /** files modified in the requested span of commits */
  modified: string[];
}

/**
 * Properties present for all jobs
 */
export interface BasicJob {
  /**
   * ID always starts with a date-stamp
   */
  id: string;
  /**
   * Indicates the commit since which changes are to be considered
   */
  from?: string;
  /**
   * Indicates the commit until which changes are to be considered
   */
  till?: string;
  /**
   * Used for commit author
   */
  author: {
    name: string;
    email: string;
  };
}

/**
 * A job which was triggered by a webhook.
 *
 * Already contains ChangeSummary as this information is provided by the webhook.
 */
export interface WebhookJob extends BasicJob {
  /**
   * Relevant changes as provided by the webhook payload
   */
  files: ChangeSummary;
}

/**
 * A job which was triggered by a request to /full_update
 */
export interface FullUpdateJob extends BasicJob {
  /**
   * Slice of files that were present when the full_update was triggered
   */
  files: { modified: string[] };
}

/**
 * Represents the task of gathering files for full_update
 */
export interface FullUpdateGatherJob extends BasicJob {
  /** Type of the Job */
  type: "full_update_gather";
}

/** Describes a Job */
export type Job = WebhookJob | FullUpdateJob | BasicJob;
