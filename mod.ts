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
