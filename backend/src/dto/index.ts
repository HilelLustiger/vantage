// The wire contract backend exposes to web — defined from the mockup's
// design (see web/'s former api/types.ts, now split up here by domain to
// mirror the actual api/* call sites in web). backend owns and implements
// against this; it isn't a reflection of backend's internals.
export * from "./errors.js";
export * from "./identity.js";
export * from "./accounts.js";
export * from "./assets.js";
export * from "./holdings.js";
export * from "./history.js";
export * from "./dashboard.js";
export * from "./documents.js";
