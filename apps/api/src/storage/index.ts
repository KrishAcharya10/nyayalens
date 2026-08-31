import { env } from "../config/env.js";
import { LocalDiskStorage } from "./LocalDiskStorage.js";
import type { StorageAdapter } from "./StorageAdapter.js";

let storage: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  if (!storage) {
    storage = new LocalDiskStorage(env.STORAGE_ROOT);
  }
  return storage;
}

export type { StorageAdapter } from "./StorageAdapter.js";
