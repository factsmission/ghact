import { type Job } from "../mod.ts";

/**
 * added, removed and modified contiain the respective changed files as a list of paths (strings)
 */
export interface ChangeSummary {
  /** files added in the requested span of commits */
  added: string[];
  /** files removed in the requested span of commits */
  removed: string[];
  /** files modified in the requested span of commits */
  modified: string[];
  /** commit hash of commit up until which changes were considered */
  till: string;
}

/**
 * Represents a git repository on disk, with convenience functions to manage it.
 *
 * Used internally to manage the source-repository.
 */
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

  /** @internal */
  private readonly authUri: string;

  /**
   * Only creates the repository instance in TS and ensures that the directory exists.
   * Doesn't clone or otherwise initalize the repository on disk.
   *
   * Use `.updateLocalData()` to actually pull or clone the repository onto the disk.
   */
  constructor(
    uri: string,
    branch: string,
    private readonly token: string | undefined,
    directory: string,
  ) {
    this.uri = uri;
    this.branch = branch;
    this.directory = directory;
    this.authUri = this.token
      ? this.uri.replace("https://", `https://${this.token}@`)
      : this.uri;
    Deno.mkdirSync(this.directory, { recursive: true });
    console.log(`Created dir ${this.directory}`);
  }

  /**
   * Clears the directory.
   * Requires a new run of cloneRepo afterwards.
   */
  emptyDataDir() {
    Deno.removeSync(this.directory, { recursive: true });
    Deno.mkdirSync(this.directory, { recursive: true });
  }

  /**
   * Clones the repo into the directory (git clone).
   *
   * Please ensure that the directory is empty beforehand
   * or use `.updateLocalData()` if the repository may already be cloned, `.updateLocalData()` will only clone if neccesary.
   */
  cloneRepo(log: (msg: string) => void = console.log) {
    log(`Cloning ${this.uri}. This will take some time.`);
    const p = new Deno.Command("/usr/bin/git", {
      args: [
        "clone",
        "--single-branch",
        "--quiet",
        `--branch`,
        `${this.branch}`,
        this.authUri,
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
      throw new Error(
        `Cloning of ${this.uri} into ${this.directory} failed, see logs.`,
      );
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

  /**
   * Wrapper for `git push`
   */
  push(log: (msg: string) => void = console.log) {
    const p = new Deno.Command("/usr/bin/git", {
      args: [
        "push",
        "--quiet",
        this.authUri,
      ],
      cwd: this.directory,
    });
    const { success, stdout, stderr } = p.outputSync();
    log("git push STDOUT:");
    log(new TextDecoder().decode(stdout));
    log("git push STDERR:");
    log(new TextDecoder().decode(stderr));
    if (!success) {
      throw new Error("git push failed, see logs.");
    }
  }

  /**
   * Updates git config to make job-author commit-author, adds all files and makes a commit.
   *
   * ```sh
   * git config --replace-all user.name ${job.author.name}
   * git config --replace-all user.email ${job.author.email}
   * git add -A
   * git commit --quiet -m "${message}"
   * ```
   */
  commit(job: Job, message: string, log: (msg: string) => void = console.log) {
    const commands = `git config --replace-all user.name ${job.author.name}
                      git config --replace-all user.email ${job.author.email}
                      git add -A
                      git commit --quiet -m ${JSON.stringify(message)}`;
    const p = new Deno.Command("bash", {
      args: [
        "-c",
        commands,
      ],
      cwd: this.directory,
    });
    const { success, stdout, stderr } = p.outputSync();
    log("git commit STDOUT:");
    log(new TextDecoder().decode(stdout));
    log("git commit STDERR:");
    log(new TextDecoder().decode(stderr));
    if (!success) {
      throw new Error("git commit failed, see logs.");
    }
  }
}
