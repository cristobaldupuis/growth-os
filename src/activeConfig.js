// =============================================================================
// ACTIVE CONFIG — the one line that switches deployments
// =============================================================================
// Every app-logic file imports config from here, never from a config.*.js
// file directly. Switching which client is live is a one-line edit to the
// path below — nothing else in the app changes.
//
// To deploy a different client: point the export at their config file
// (see config.js's header for how to create one), then build and deploy.
// =============================================================================
export * from "./config.demo.js";
