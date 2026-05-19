/**
 * @typedef {import('./src/config.ts').LatticeConfig} LatticeConfig
 * @typedef {import('./src/config.ts').LatticeConfigExport} LatticeConfigExport
 * @typedef {import('./src/config.ts').LatticeConfigFn} LatticeConfigFn
 * @typedef {import('./src/config.ts').LatticeConfigFnObject} LatticeConfigFnObject
 * @typedef {import('./src/config.ts').LatticeConfigFnPromise} LatticeConfigFnPromise
 */

/**
 * Type helper for lattice.config.mjs.
 *
 * @overload
 * @param {LatticeConfig} config
 * @returns {LatticeConfig}
 */

/**
 * @overload
 * @param {Promise<LatticeConfig>} config
 * @returns {Promise<LatticeConfig>}
 */

/**
 * @overload
 * @param {LatticeConfigFnObject} config
 * @returns {LatticeConfigFnObject}
 */

/**
 * @overload
 * @param {LatticeConfigFnPromise} config
 * @returns {LatticeConfigFnPromise}
 */

/**
 * @overload
 * @param {LatticeConfigFn} config
 * @returns {LatticeConfigFn}
 */

/**
 * @param {LatticeConfigExport} config
 * @returns {LatticeConfigExport}
 */
export function defineConfig(config) {
  return config;
}
