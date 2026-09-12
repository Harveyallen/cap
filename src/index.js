/**
 * Public programmatic API for CAP.
 * Prefer these exports over deep-importing internal modules from outside the package.
 */
export { main as runCli } from './cli.js';
export { searchCapabilities } from './search.js';
export { acquireCapability, loadCatalog, loadState, saveState } from './registry.js';
export { useCapability } from './use.js';
export { inspectLocal } from './inspector.js';
export { applyOptimization, buildOptimizationPlan, writeOptimizationPlan } from './optimize.js';
export { handleMcpMessage, startMcpServer } from './mcp-server.js';
export { createWebServer, startWebServer } from './web-server.js';
export { capHome, packageRoot } from './paths.js';
