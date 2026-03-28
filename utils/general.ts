export async function importWithError<T>(moduleName: string): Promise<T> {
  try {
    return (await import(moduleName)) as T;
  } catch (error) {
    const final = new Error(
      `Failed to import module "${moduleName}". Please ensure it is installed.`,
      { cause: error },
    );
    throw final;
  }
}

export function pkgExists(moduleName: string): boolean {
  try {
    import.meta.resolve(moduleName);
    return true;
  } catch {}
  return false;
}
