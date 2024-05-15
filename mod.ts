export { GHActServer } from "./src/GHActServer.ts";
export { GHActWorker } from "./src/GHActWorker.ts";
export { type ChangeSummary, GitRepository } from "./src/GitRepository.ts";
export { combineCommandOutputs } from "./src/log.ts";

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

/** Describes a Job */
export interface Job {
  /**
   * ID always starts with a date-stamp
   */
  id: string;
  /**
   * Indicates the commit since which changes are considered
   */
  from?: string;
  /**
   * Indicates the commit until which changes are considered
   */
  till?: string;
  /**
   * Used for commit author
   */
  author: {
    name: string;
    email: string;
  };
  /**
   * Only used for full_update
   */
  files?: {
    modified?: string[];
    removed?: string[];
  };
}

/**
 * This function is passed to the jobHandler and is used to log messages to the
 * respective logfiles. It will also log the messages to the console.
 *
 * If a string is passed, the promise is resolved instantly, and it may be
 * treated as a sync function returning void.
 *
 * If a ReadableStream is passed (e.g. output from an external command) then the
 * promise only resolves after the write has finished. In this case you must
 * await the promise.
 */
export type LogFn = (
  message: string | ReadableStream<Uint8Array>,
) => Promise<void>;
