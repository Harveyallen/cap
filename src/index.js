/**
 * Public programmatic API for CAP.
 * Read / main-path only. Import optimize, servers, and registry writes from their modules.
 */
export { searchCapabilities } from './search.js';
export { acquireCapability } from './registry.js';
export { useCapability } from './use.js';
export { inspectLocal } from './inspector.js';
export { loadCatalog, loadState } from './registry.js';
