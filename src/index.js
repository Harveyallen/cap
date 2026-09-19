/**
 * Public programmatic API for CAP.
 * Read / main-path only (`searchCapabilities` may append a local search Activity event).
 * Import optimize, servers, and other registry writes from their modules.
 */
export { searchCapabilities } from './search.js';
export { addCapability } from './registry.js';
export { useCapability } from './use.js';
export { inspectLocal } from './inspector.js';
export { loadCatalog, loadState } from './registry.js';
