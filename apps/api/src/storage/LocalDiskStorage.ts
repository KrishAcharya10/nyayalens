import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageAdapter } from "./StorageAdapter.js";

export class LocalDiskStorage implements StorageAdapter {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolveKey(key: string): string {
    const resolved = path.resolve(this.root, key);
    // Reject any key that escapes the storage root (path traversal).
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return resolved;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const filePath = this.resolveKey(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolveKey(key), { force: true });
  }
}
