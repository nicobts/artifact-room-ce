import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StorageAdapter } from "./index";

/**
 * Local-disk StorageAdapter. Writes blobs under the mounted volume.
 *
 * Content type is stored in a sidecar `<key>.meta` file so the disk impl is
 * self-describing without a database lookup. Keys are treated as opaque and
 * path-segments are sanitized to prevent traversal outside the root.
 */
export class DiskStorage implements StorageAdapter {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    // Disallow path traversal; keys are opaque ids, not user paths.
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_");
    return join(this.root, safe);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    await writeFile(`${path}.meta`, contentType, "utf8");
  }

  async get(
    key: string,
  ): Promise<{ data: Buffer; contentType: string } | null> {
    const path = this.resolve(key);
    try {
      const [data, contentType] = await Promise.all([
        readFile(path),
        readFile(`${path}.meta`, "utf8"),
      ]);
      return { data, contentType };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.resolve(key);
    await rm(path, { force: true });
    await rm(`${path}.meta`, { force: true });
  }
}
