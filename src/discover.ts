const TS_EXT = /\.(ts|tsx|mts|cts)$/;
const DECL_EXT = /\.d\.(ts|mts|cts)$/;

/**
 * True for TypeScript source files pabst should scan: .ts/.tsx/.mts/.cts,
 * excluding declaration files — tsc copies JSDoc into declarations, so
 * scanning them alongside their sources extracts every property twice.
 */
export function isTsSource(file: string): boolean {
  return TS_EXT.test(file) && !DECL_EXT.test(file);
}
