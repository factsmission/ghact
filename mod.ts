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
   * Only used for transform_all
   */
  files?: {
    modified?: string[];
    removed?: string[];
  };
}

export { GHActServer } from "./src/GHActServer.ts";
export { GHActWorker } from "./src/GHActWorker.ts";
