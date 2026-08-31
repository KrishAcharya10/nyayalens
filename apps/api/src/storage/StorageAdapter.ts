// Minimal storage interface so the local-disk implementation can be
// swapped for an object-store one (S3, etc.) later without touching
// upload/extraction call sites. Only what Phase 3 actually needs.
export interface StorageAdapter {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
