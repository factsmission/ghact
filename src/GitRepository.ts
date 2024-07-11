import { type ChangeSummary, type Job } from "../mod.ts";
import { existsSync } from "./deps.ts";
import { combineCommandOutputs, commandOutputToLines, LogFn } from "./log.ts";

const consoleLog = new LogFn(false, true);

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
   * Please ensure that the directory is empty beforehand or use
   * `.updateLocalData()` if the repository may already be cloned,
   * `.updateLocalData()` will only clone if neccesary.
   *
   * @param {boolean} [blobless=false] Whether to use --filter=blob:none to
   * exclude previous verisions of files. May or may not speed up the clone;
   * will reduce the amount of storage occupied by the repository.
   */
  async cloneRepo(log: LogFn = consoleLog, blobless = false) {
    log(
      `== starting git clone for ${this.uri} ==\n== this may take some time ==`,
    );
    if (existsSync(this.directory)) {
      Deno.mkdirSync(this.directory, { recursive: true });
    }
    const command = new Deno.Command("/usr/bin/git", {
      args: [
        "clone",
        "--single-branch",
        // "--quiet",
        // this will make it download only blobs(=files) as present in the
        // latest commit. History and historical trees are still cloned, but old
        // verions of files are only downloaded if needed (e.g. by git diff)
        blobless ? "--filter=blob:none" : "",
        `--branch=${this.branch}`,
        this.authUri,
        `.`,
      ].filter((v) => v !== ""),
      cwd: this.directory,
      stdin: "null",
      stderr: "piped",
      stdout: "piped",
    });
    const child = command.spawn();
    await log(combineCommandOutputs(child.stdout, child.stderr));
    const { success } = await child.status;

    if (success) {
      log("== git clone successful ==");
    } else {
      log("== git clone failed ==");
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
  async updateLocalData(log: LogFn = consoleLog) {
    log("== starting git pull ==");

    if (existsSync(this.directory) && existsSync(`${this.directory}/.git`)) {
      const command = new Deno.Command("/usr/bin/git", {
        args: ["pull"],
        env: {
          GIT_CEILING_DIRECTORIES: this.directory,
        },
        cwd: this.directory,
        stdin: "null",
        stderr: "piped",
        stdout: "piped",
      });
      const child = command.spawn();
      await log(combineCommandOutputs(child.stdout, child.stderr));
      const { success } = await child.status;

      if (!success) {
        log("== git pull failed, will attempt to clone instead ==");
      } else {
        log("== git pull successful ==");
      }
      if (success) return;
    }

    this.emptyDataDir();
    await this.cloneRepo(log);
  }

  /**
   * Turns the ref string into an unambiguous representation: the hash of that commit object.
   *
   * Wrapper for `git rev-parse ${ref}`
   */
  async getFullHash(ref: string, log: LogFn = consoleLog): Promise<string> {
    const command = new Deno.Command("/usr/bin/git", {
      args: ["rev-parse", ref],
      env: {
        GIT_CEILING_DIRECTORIES: this.directory,
      },
      cwd: this.directory,
      stdin: "null",
      stderr: "piped",
      stdout: "piped",
    });
    const child = command.spawn();
    const [outA, outB] = child.stdout.tee();
    await log(combineCommandOutputs(outA, child.stderr));
    const { success } = await child.status;
    if (success) {
      let result = "";
      for await (
        const chunk of outB.pipeThrough(new TextDecoderStream()).values()
      ) {
        result += chunk;
      }
      return result.split("\n")[0];
    }
    throw new Error(`Could not rev-parse ${ref}, aborting`);
  }

  /**
   * Get a list of all changed files between two commits, including the changes
   * made in those commits. If fromCommit == tillCommit, will return the changes
   * made in that single commit.
   *
   * It will figure out the full hashes of the commits and return them in the ChangeSummary (even if `tillCommit === "HEAD"`).
   *
   * @param fromCommit Commit hash
   * @param tillCommit Commit hash, defaults to "HEAD"
   * @returns ChangeSummary describing the files changed between the two commits.
   */
  async getModifiedAfter(
    fromCommit: string,
    tillCommit = "HEAD",
    log: LogFn = consoleLog,
  ): Promise<ChangeSummary> {
    await this.updateLocalData(log);
    log("== git diff ==");
    const fromHash = await this.getFullHash(fromCommit);
    const tillHash = await this.getFullHash(tillCommit);
    log(
      `== from: ${fromCommit} (${fromHash}), till: ${tillCommit} (${tillHash})`,
    );
    const args = [
      "diff",
      "--name-status",
      "--no-renames", // handle renames as a deletion and an addition
    ];
    if (fromHash === tillHash) {
      args.push(`${fromHash}^!`);
    } else {
      args.push(`${fromHash}^@`);
      args.push(tillHash);
    }
    const command = new Deno.Command("/usr/bin/git", {
      args,
      cwd: this.directory,
      stdin: "null",
      stderr: "piped",
      stdout: "piped",
    });
    const child = command.spawn();
    const [stdout, stdoutForLog] = child.stdout.tee();
    await log(combineCommandOutputs(stdoutForLog, child.stderr));
    const { success } = await child.status;
    if (!success) {
      throw new Error("git diff failed, see logs.");
    }

    const typedFiles = (await Array.fromAsync(commandOutputToLines(stdout)))
      .filter((
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
      from: fromHash,
      till: tillHash,
    });
  }

  /**
   * Wrapper for `git push`
   */
  async push(log: LogFn = consoleLog) {
    log("== git push ==");
    const command = new Deno.Command("/usr/bin/git", {
      args: [
        "push",
        "--quiet",
        this.authUri,
      ],
      cwd: this.directory,
      stdin: "null",
      stderr: "piped",
      stdout: "piped",
    });
    const child = command.spawn();
    await log(combineCommandOutputs(child.stdout, child.stderr));
    const { success } = await child.status;
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
  async commit(job: Job, message: string, log: LogFn = consoleLog) {
    log("== git commit ==");
    const commands = `git config --replace-all user.name ${job.author.name}
                      git config --replace-all user.email ${job.author.email}
                      git add -A
                      git diff-index --quiet HEAD || git commit -m ${
      JSON.stringify(message)
    }`;
    // `git diff-index --quiet HEAD` exits with 0 if no changes are staged, skipping the commit
    const command = new Deno.Command("bash", {
      args: [
        "-c",
        commands,
      ],
      cwd: this.directory,
      stdin: "null",
      stderr: "piped",
      stdout: "piped",
    });
    const child = command.spawn();
    await log(combineCommandOutputs(child.stdout, child.stderr));
    const { success } = await child.status;

    if (!success) {
      throw new Error("git commit failed, see logs.");
    }
  }
}
