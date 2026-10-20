// The Khronos glTF validator (npm `gltf-validator`, compiled from Dart) ships without TypeScript types; this declares
// the one call the tests use. The report shape is documented at https://github.com/KhronosGroup/glTF-Validator.
declare module 'gltf-validator' {
  export function validateBytes(data: Uint8Array, options?: { maxIssues?: number; uri?: string }): Promise<unknown>;
}
