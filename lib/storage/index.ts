/**
 * Blob storage interface (portability discipline — docs/adr/0001-database-and-storage-targets.md).
 *
 * App code depends ONLY on this interface. The disk implementation is MVP;
 * an S3-compatible implementation later is a second file conforming to the
 * same contract, with no caller changes. Do not reach around this interface
 * with hard-coded paths.
 */
export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

let singleton: StorageAdapter | null = null;

/**
 * Returns the configured storage adapter. MVP: local disk under DATA_DIR.
 * The selection point is intentionally centralized so swapping to S3 is a
 * one-line change here.
 */
export async function getStorage(): Promise<StorageAdapter> {
  if (singleton) return singleton;
  const { DiskStorage } = await import("./disk");
  const root = process.env.DATA_DIR ?? "./data";
  singleton = new DiskStorage(`${root}/blobs`);
  return singleton;
}
