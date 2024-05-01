/**
 * added, removed and modified contiain the respective changed files as a list of paths (strings)
 */
export interface ChangeSummary {
  added: string[];
  removed: string[];
  modified: string[];
  /**
   * commit hash of commit up until which changes were considered
   */
  till: string;
}

export class GitRepository {
  // non-private members are declared this way and not via the constructor to enable documentation.
  /**
   * The uri of the repository that will be cloned into ${workDir}/repository
   *
   * Note that authentification via token is only possible for https-uris.
   *
   * e.g `"https://github.com/factsmission/ghact.git"`
   */
  readonly uri: string;
  /** Branch to checkout
   *
   * e.g `"main"`
   */
  readonly branch: string;
  /**
   * Where to clone the repository into
   *
   * e.g. `"/workdir/repository"`
   */
  readonly directory: string;

  constructor(
    uri: string,
    branch: string,
    private readonly token: string | undefined,
    directory: string,
  ) {
    this.uri = uri;
    this.branch = branch;
    this.directory = directory;
    Deno.mkdirSync(this.directory, { recursive: true });
    console.log(`Created dir ${this.directory}`);
  }

  /**
   * Clears the repoDir.
   * Requires a new run of cloneRepo afterwards.
   */
  emptyDataDir() {
    Deno.removeSync(this.directory, { recursive: true });
    Deno.mkdirSync(this.directory, { recursive: true });
  }

  /**
   * clones the repo into repoDir (git clone)
   */
  cloneRepo(log: (msg: string) => void = console.log) {
    log(`Cloning ${this.uri}. This will take some time.`);
    const authUri = this.token
      ? this.uri.replace(
        "https://",
        `https://${this.token}@`,
      )
      : this.uri;
    const p = new Deno.Command("/usr/bin/git", {
      args: [
        "clone",
        "--single-branch",
        "--quiet",
        `--branch`,
        `${this.branch}`,
        authUri,
        `.`,
      ],
      cwd: this.directory,
    });
    const { success, stdout, stderr } = p.outputSync();
    if (!success) {
      log("git clone failed:");
    } else {
      log("git clone succesful:");
    }
    log("STDOUT:");
    log(new TextDecoder().decode(stdout));
    log("STDERR:");
    log(new TextDecoder().decode(stderr));
    if (!success) {
      throw new Error("Abort.");
    }
  }

  /**
   * updates the repo (git pull)
   *
   * if it fails, it automatically calls `this.emptyDataDir()` and `this.cloneRepo(log)`.
   */
  updateLocalData(
    log: (msg: string) => void = console.log,
  ) {
    log("starting git pull...");

    const p = new Deno.Command("/usr/bin/git", {
      args: ["pull"],
      env: {
        GIT_CEILING_DIRECTORIES: this.directory,
      },
      cwd: this.directory,
    });
    const { success, stdout, stderr } = p.outputSync();
    if (!success) {
      log("git pull failed:");
    } else {
      log("git pull successful:");
    }
    log(new TextDecoder().decode(stdout));
    log("STDERR:");
    log(new TextDecoder().decode(stderr));
    log("STDOUT:");
    if (!success) {
      this.emptyDataDir();
      this.cloneRepo(log);
    }
  }

  /**
   * Get a list of all changed files between two commits
   *
   * If `tillCommit === "HEAD"`, it will figure out the commit hash of till and return it in the ChangeSummary.
   *
   * @param fromCommit Commit hash
   * @param tillCommit Commit hash, defaults to "HEAD"
   * @returns ChangeSummary describing the files changed between the two commits.
   */
  getModifiedAfter(
    fromCommit: string,
    tillCommit = "HEAD",
    log: (msg: string) => void = console.log,
  ): ChangeSummary {
    this.updateLocalData(log);
    const p = new Deno.Command("/usr/bin/git", {
      args: [
        "diff",
        "--name-status",
        "--no-renames", // handle renames as a deletion and an addition
        fromCommit,
        tillCommit,
      ],
      cwd: this.directory,
    });
    const { success, stdout, stderr } = p.outputSync();
    log("STDOUT:");
    log(new TextDecoder().decode(stdout));
    log("STDERR:");
    log(new TextDecoder().decode(stderr));
    if (!success) {
      throw new Error("Abort.");
    }
    if (tillCommit === "HEAD") {
      const p = new Deno.Command("/usr/bin/git", {
        args: [
          "rev-parse",
          "HEAD",
        ],
        cwd: this.directory,
      });
      const { success, stdout } = p.outputSync();
      if (success) {
        tillCommit = new TextDecoder().decode(stdout).trim();
        log("HEAD is: " + tillCommit);
      }
    }
    const typedFiles = new TextDecoder().decode(stdout).split("\n").filter((
      s,
    ) => s.length > 0).map((s) =>
      s.split(/(\s+)/).filter((p) => p.trim().length > 0)
    );
    const weirdFiles = typedFiles.filter((t) =>
      t[0] !== "A" && t[0] !== "M" && t[0] !== "D"
    );
    if (weirdFiles.length) {
      log(
        `Unclear how to handle these files:\n - ${
          weirdFiles.map((t) => t.join).join("\n - ")
        }`,
      );
    }
    return ({
      added: typedFiles.filter((t) => t[0] === "A").map((t) => t[1]),
      modified: typedFiles.filter((t) => t[0] === "M").map((t) => t[1]),
      removed: typedFiles.filter((t) => t[0] === "D").map((t) => t[1]),
      till: tillCommit,
    });
  }
}
