import { createRuntimeApp } from '../backend-node/src/runtime.js';

// Vercel invokes the Express handler; no local listener is opened.
export default createRuntimeApp();
