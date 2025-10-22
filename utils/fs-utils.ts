import { readdir } from 'node:fs/promises';
import path from 'node:path';

const { join } = path;

type FileCallback = (
  fileName: string,
  absolutePath: string,
) => void | Promise<void>;

export interface ScanFilesOptions {
  /**
   * Filter function to exclude certain files/directories
   * Return false to exclude the entry
   */
  filter?: (entryPath: string, isDirectory: boolean) => boolean;
}

/**
 * Recursively traverse a directory and call a callback for each file
 *
 * This is a generic utility that provides only the directory traversal capability.
 * The callback receives the file name and absolute path, allowing the caller to
 * decide how to process each file (copy, transform, emit, etc.).
 *
 * Recursively traverse a directory using stable Node.js APIs
 * Compatible with Node js 20.x without experimental features
 *
 * @param sourceDir - Source directory path to traverse
 * @param callback - Function to call for each file found
 * @param options - Traversal options
 */
export async function scanFiles(
  sourceDir: string,
  callback: FileCallback,
  options: ScanFilesOptions = {},
): Promise<void> {
  const { filter } = options;

  if (filter && !filter(sourceDir, true)) {
    return;
  }

  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(sourceDir, entry.name);

    if (filter && !filter(entryPath, entry.isDirectory())) {
      continue;
    }

    if (entry.isDirectory()) {
      await scanFiles(entryPath, callback, options);
    } else if (entry.isFile()) {
      await callback(entry.name, entryPath);
    }
  }
}
