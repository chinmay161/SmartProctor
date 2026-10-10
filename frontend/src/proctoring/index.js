// Entry point of the lazily loaded proctoring chunk. Import only via dynamic
// import() so MediaPipe never lands in the main bundle.
export { createVisionController, CONTROLLER_DEFAULTS, classifyCameraError } from './controller';
export { DEFAULT_CONFIG as TEMPORAL_DEFAULTS } from './temporalEngine';
export { ASSETS, OBJECT_MODELS } from './visionEngine';
