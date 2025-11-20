import path from "node:path";
import fs from "node:fs/promises";
import type { Stats } from "node:fs";
import os from "node:os";
import { randomUUID } from "node:crypto";

class Path {
  protected _path: string;
  protected _statcache: Stats | undefined;

  protected constructor(p: string | Path) {
    this._path = path.normalize(typeof p === "string" ? p : p.toString());
  }

  protected _setPath(p: string) {
    this._path = p;
    this._statcache = undefined;
  }

  static at(p: string | Path): Path {
    return new Path(p);
  }

	/** Provides a string version of */
  valueOf(): string {
    return this._path;
  }

  toString(): string {
    return this._path;
  }

  join(...paths: string[]): Path {
    return new Path(path.join(this._path, ...paths));
  }

  basename(): string {
    return path.basename(this._path);
  }

  name(): string {
    return path.basename(this._path, path.extname(this._path));
  }

  ext(): string {
    return path.extname(this._path);
  }

  isAbsolute(): boolean {
    return path.isAbsolute(this._path);
  }

  resolve(): Path {
    return new Path(path.resolve(this._path));
  }

  relativeTo(to: string): Path {
    return new Path(path.relative(to, this._path));
  }

  parent(): Directory {
    return new Path(path.dirname(this._path)).as(Directory);
  }

  withExt(newExt: string): Path {
    const basename = path.basename(this._path, path.extname(this._path));
    return new Path(
      path.join(path.dirname(this._path), `${basename}${newExt}`)
    );
  }

  withName(newName: string): Path {
    return new Path(path.join(path.dirname(this._path), newName));
  }

  async isFile(): Promise<boolean> {
    try {
      return (await this.stat()).isFile();
    } catch (e: any) {
      if (e.code === "ENOENT") {
        return false;
      }
      throw e;
    }
  }

  async isDirectory(): Promise<boolean> {
    try {
      return (await this.stat()).isDirectory();
    } catch (e: any) {
      if (e.code === "ENOENT") {
        return false;
      }
      throw e;
    }
  }

  async stat(): Promise<Stats> {
    if (!this._statcache) this._statcache = await fs.stat(this._path);
    return this._statcache;
  }

  async lstat(): Promise<Stats> {
    if (!this._statcache) this._statcache = await fs.lstat(this._path);
    return this._statcache;
  }

  clearCache() {
    this._statcache = undefined;
  }

  /* Takes any type of path including Files and Dirs and casts it as a different one. */
  as<T extends Path>(type: { at: (p: string) => T }): T {
    if (!(this instanceof Path) || typeof this._path !== "string") {
      throw new TypeError("Invalid Path object");
    }

    if (this instanceof Directory && type === (File as any)) {
      throw new TypeError("Cannot cast a Directory to a File");
    }

    if (this instanceof File && type === (Directory as any)) {
      throw new TypeError("Cannot cast a File to a Directory");
    }

    return type.at(this.toString());
  }

  // Unsafe version of as() absolutely no checking is done at all.
  uAs<T extends Path>(type: { at: (p: string) => T }): T {
    return type.at(this.toString());
  }
}

class File extends Path {
  private _contentCache: string | undefined;

  protected constructor(p: string | Path) {
    super(p);
  }

  static at(p: string | Path): File {
    return new File(p);
  }

  clearCache(): void {
    super.clearCache();
    this._contentCache = undefined;
  }

  async exists(): Promise<boolean> {
    return this.isFile();
  }

  async read(encoding: BufferEncoding = "utf-8"): Promise<string> {
    if (encoding === "utf-8" && this._contentCache) {
      return this._contentCache;
    }
    let content = await fs.readFile(this.toString(), encoding);
    if (encoding === "utf-8") {
      this._contentCache = content as string;
    }
    return content;
  }

  async write(
    data: string | Buffer,
    encoding: BufferEncoding = "utf-8",
    ensure: boolean = true
  ): Promise<void> {
    if (ensure) {
      await this.ensure();
    }
    this.clearCache();
    await fs.writeFile(this.toString(), data, encoding);
  }

  async size(): Promise<number> {
    const stats = await this.stat();
    return stats.size;
  }

  async remove(): Promise<void> {
    await fs.rm(this.toString());
		this.clearCache();
  }

  async renameTo(newName: string, modifying = true): Promise<void> {
    const parentDir = path.dirname(this.toString());
    await fs.rename(this.toString(), path.join(parentDir, newName));
		if (modifying) super._setPath(`${parentDir}/${newName}`);
  }
  async copyTo(target: string): Promise<this> {
    await fs.copyFile(this.toString(), target);
    return this;
  }

  async moveTo(target: string, modifying = true): Promise<void> {
    await fs.rename(this.toString(), target);
    if (modifying) super._setPath(target);
  }

  async create(recursive = true): Promise<this> {
    await fs.mkdir(path.dirname(this.toString()), { recursive });
    await fs.writeFile(this.toString(), "");
    return this;
  }

  async ensure(): Promise<this> {
    if (!(await this.exists())) {
      await this.create();
    }
    return this;
  }
}

class Directory extends Path {
  protected constructor(p: string | Path) {
    super(p);
  }

  static at(p: string | Path): Directory {
    return new Directory(p);
  }

  async exists(): Promise<boolean> {
    return this.isDirectory();
  }

  async listFiles(): Promise<File[]> {
    const entries = await fs.readdir(this.toString(), { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile());
    return files.map((entry) =>
      File.at(path.join(this.toString(), entry.name))
    );
  }

  async listDirs(): Promise<Directory[]> {
    const entries = await fs.readdir(this.toString(), { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory());
    return dirs.map(
      (entry) => new Directory(path.join(this.toString(), entry.name))
    );
  }

  async list(): Promise<(File | Directory)[]> {
    const entries = await fs.readdir(this.toString(), { withFileTypes: true });
    const filesAndDirs: (File | Directory)[] = [];
    for (const entry of entries) {
      const fullPath = path.join(this.toString(), entry.name);
      if (entry.isFile()) {
        filesAndDirs.push(File.at(fullPath));
      } else if (entry.isDirectory()) {
        filesAndDirs.push(new Directory(fullPath));
      }
    }
    return filesAndDirs;
  }

  private async _listAllDeep(
    dirPath: string
  ): Promise<{ files: File[]; dirs: Directory[] }> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const promises: Promise<{ files: File[]; dirs: Directory[] }>[] =
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isFile()) {
          return { files: [File.at(fullPath)], dirs: [] };
        } else if (entry.isDirectory()) {
          const nestedResults = await this._listAllDeep(fullPath);
          return {
            files: nestedResults.files,
            dirs: [new Directory(fullPath), ...nestedResults.dirs],
          };
        }

        return { files: [], dirs: [] };
      });

    const allResults = await Promise.all(promises);

    return allResults.reduce(
      (acc, current) => ({
        files: [...acc.files, ...current.files],
        dirs: [...acc.dirs, ...current.dirs],
      }),
      { files: [], dirs: [] }
    );
  }
  async listFilesDeep(): Promise<File[]> {
    return (await this._listAllDeep(this.toString())).files;
  }

  async listDirsDeep(): Promise<Directory[]> {
    return (await this._listAllDeep(this.toString())).dirs;
  }

  async listDeep(): Promise<(File | Directory)[]> {
    const { files, dirs } = await this._listAllDeep(this.toString());
    return [...files, ...dirs];
  }

  async remove(): Promise<void> {
    await fs.rm(this.toString(), { recursive: true });
  }

  async renameTo(newName: string, modifying = true): Promise<void> {
    const parentDir = path.dirname(this.toString());
    if (modifying) super._setPath(`${parentDir}/${newName}`);
    await fs.rename(this.toString(), path.join(parentDir, newName));
  }

  async copyTo(target: string): Promise<this> {
    await fs.cp(this.toString(), target, { recursive: true });
    return this;
  }

  async create(recursive = true): Promise<this> {
    await fs.mkdir(this.toString(), { recursive });
    return this;
  }

  async moveTo(target: string, modifying = true): Promise<void> {
    await fs.rename(this.toString(), target);
    if (modifying) super._setPath(target);
  }

  async clear(): Promise<void> {
    const items = await fs.readdir(this.toString());
    await Promise.all(
      items.map((item) =>
        fs.rm(path.join(this.toString(), item), {
          recursive: true,
          force: true,
        })
      )
    );
  }

  async walk(
    callback: (item: File | Directory) => Promise<void> | void
  ): Promise<void> {
    const items = await this.list();
    for (const item of items) {
      await callback(item);
      if (item instanceof Directory) {
        await item.walk(callback);
      }
    }
  }

  async ensure(): Promise<this> {
    if (!(await this.exists())) {
      await this.create();
    }
    return this;
  }
}

class Json extends File {
  protected constructor(p: string | Path) {
    super(p);
  }

  static at(p: string | Path): Json {
    return new Json(p);
  }

  async read<T>(): Promise<T> {
    return JSON.parse(await super.read("utf-8"));
  }

  async write(
    data: unknown,
    encoding: BufferEncoding = "utf-8"
  ): Promise<void> {
    if (typeof data === "object" && !Buffer.isBuffer(data)) {
      return super.write(JSON.stringify(data, null, 2), encoding);
    }
    return super.write(JSON.stringify(data), encoding);
  }

  async create(recursive = true): Promise<this> {
    await fs.mkdir(path.dirname(this.toString()), { recursive });
    await fs.writeFile(this.toString(), "{}");
    return this;
  }
}

class TempDir extends Directory {
  constructor() {
    const tempPath = path.join(os.tmpdir(), `temp-${randomUUID()}`);
    super(tempPath);
  }
  async with<T>(fn: (dir: TempDir) => Promise<T>): Promise<T> {
    await this.create();
    try {
      return await fn(this);
    } finally {
      await this.remove();
			super.clearCache();
    }
  }
}
export { Path, File, Directory, Json, TempDir };
