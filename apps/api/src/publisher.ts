/**
 * Publication to the public data repository (spec/formats.md §9.1, ADR-0017). One call is one
 * commit. The GitHub implementation uses a fine-grained token limited to that repository.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface File {
  path: string;
  content: string;
}

export interface Publisher {
  publish(files: File[], message: string): Promise<void>;
  /** True when GitHub Pages (or the equivalent) already serves `content` at `path`. */
  isServed(file: File): Promise<boolean>;
}

/** Documents are published readable; only their values are hashed (spec/formats.md §1.3). */
export function jsonFile(path: string, value: unknown): File {
  return { path, content: JSON.stringify(value, null, 2) + "\n" };
}

export class MemoryPublisher implements Publisher {
  readonly files = new Map<string, string>();
  readonly commits: string[] = [];
  async publish(files: File[], message: string): Promise<void> {
    for (const f of files) this.files.set(f.path, f.content);
    this.commits.push(message);
  }
  async isServed(file: File): Promise<boolean> {
    return this.files.get(file.path) === file.content;
  }
}

/** Writes to a local folder. For development and for running tools/verify on test data. */
export class DirectoryPublisher implements Publisher {
  readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  async publish(files: File[]): Promise<void> {
    for (const f of files) {
      const target = join(this.root, ...f.path.split("/"));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, f.content, "utf8");
    }
  }
  async isServed(): Promise<boolean> {
    return true;
  }
}

export interface GitHubConfig {
  /** `owner/name` of the data repository. */
  repository: string;
  branch: string;
  token: string;
  /** Base URL where GitHub Pages serves the repository, without a trailing slash. */
  pagesUrl: string;
}

/** Commits through the Git data API: blobs are sent inline in a new tree on top of the branch. */
export class GitHubPublisher implements Publisher {
  readonly config: GitHubConfig;
  readonly fetch: typeof fetch;
  constructor(config: GitHubConfig, fetchFn: typeof fetch = fetch) {
    this.config = config;
    this.fetch = fetchFn;
  }

  private async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetch(`https://api.github.com/repos/${this.config.repository}${path}`, {
      method,
      headers: { authorization: "Bearer " + this.config.token, accept: "application/vnd.github+json", "content-type": "application/json" },
      body: body === undefined ? null : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GitHub API ${method} ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  async publish(files: File[], message: string): Promise<void> {
    const ref = `/git/ref/heads/${this.config.branch}`;
    const head = await this.api<{ object: { sha: string } }>("GET", ref);
    const parent = await this.api<{ tree: { sha: string } }>("GET", `/git/commits/${head.object.sha}`);
    const tree = await this.api<{ sha: string }>("POST", "/git/trees", {
      base_tree: parent.tree.sha,
      tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
    });
    const commit = await this.api<{ sha: string }>("POST", "/git/commits", { message, tree: tree.sha, parents: [head.object.sha] });
    await this.api("PATCH", `/git/refs/heads/${this.config.branch}`, { sha: commit.sha });
  }

  async isServed(file: File): Promise<boolean> {
    const res = await this.fetch(`${this.config.pagesUrl}/${file.path}`, { cache: "no-store" });
    return res.ok && (await res.text()) === file.content;
  }
}
