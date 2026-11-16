import { createRuntimeApp } from './runtime.js';
import { loadConfig } from './config.js';
const config = loadConfig(process.env);
createRuntimeApp().listen(config.port, () => console.log(`GoodLook API listening on port ${config.port}`));
