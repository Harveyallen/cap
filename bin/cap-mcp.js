#!/usr/bin/env node
import { startMcpServer } from '../src/mcp-server.js';

startMcpServer().catch((error) => {
  console.error(`cap-mcp: ${error.message}`);
  process.exitCode = 1;
});
