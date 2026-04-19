import { pass } from "three/tsl";
import { ssaaPass } from "three/addons/tsl/display/SSAAPassNode.js";
import type { Camera, Scene, WebGPURenderer } from "three/webgpu";

type CompatibleScenePass = ReturnType<typeof pass> & {
  sampleLevel: number;
};

const supportsSsaaPass = (renderer: WebGPURenderer): boolean =>
  (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend === true;

export const createCompatibleScenePass = (
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  sampleLevel: number,
): CompatibleScenePass => {
  const scenePass = (
    supportsSsaaPass(renderer) ? ssaaPass(scene, camera) : pass(scene, camera)
  ) as CompatibleScenePass;

  // Keep WebGPU on the simpler pass path. SSAA still copies depth between
  // mismatched sample counts on this stack and breaks the frame.
  scenePass.sampleLevel = supportsSsaaPass(renderer) ? sampleLevel : 0;

  return scenePass;
};
