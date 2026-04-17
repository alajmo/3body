import { renderOutput } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { rgbShift } from "three/addons/tsl/display/RGBShiftNode.js";
import {
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  RenderPipeline,
  Scene,
  type WebGPURenderer,
} from "three/webgpu";
import {
  type LocalViewportCameraState,
  applyLocalViewportCameraFrame,
} from "./localViewportCamera";
import { createCompatibleScenePass } from "./postProcessingCompat";

interface StarfieldLayerVisual {
  geometry: { dispose: () => void };
  group: import("three/webgpu").Group;
  material: { dispose: () => void };
  driftX: number;
  driftY: number;
  parallax: number;
  tileSize: number;
}

interface StarfieldLayerConfig {
  alphaScale: number;
  count: number;
  colorVariance: number;
  coolColor: string;
  driftX: number;
  driftY: number;
  kind: "dust" | "movingObjects" | "stars";
  parallax: number;
  size: number;
  twinkleAmount: number;
  warmColor: string;
  z: number;
}

const registerDisposables = (
  disposables: Array<{ dispose: () => void }>,
  ...items: Array<{ dispose: () => void } | Array<{ dispose: () => void }>>
) => {
  for (const item of items) {
    if (Array.isArray(item)) {
      disposables.push(...item);
      continue;
    }

    disposables.push(item);
  }
};

export const createLocalViewportRenderShell = ({
  bloomRadius,
  bloomStrength,
  bloomThreshold,
  camera,
  cameraState,
  createBackgroundLayer,
  currentSsaaLevel,
  hostElement,
  renderer,
  backdropMaterial,
  sceneBackground,
  backgroundLayers,
}: {
  bloomRadius: number;
  bloomStrength: number;
  bloomThreshold: number;
  camera: OrthographicCamera;
  cameraState: LocalViewportCameraState;
  backdropMaterial: MeshBasicNodeMaterial;
  createBackgroundLayer: (config: StarfieldLayerConfig) => StarfieldLayerVisual;
  currentSsaaLevel: number;
  hostElement: HTMLDivElement;
  renderer: WebGPURenderer;
  sceneBackground: import("three/webgpu").Color;
  backgroundLayers: readonly StarfieldLayerConfig[];
}) => {
  const disposables: Array<{ dispose: () => void }> = [];
  const scene = new Scene();
  scene.background = sceneBackground.clone();

  const backdropGeometry = new PlaneGeometry(1, 1);
  const backdropMesh = new Mesh(backdropGeometry, backdropMaterial);
  backdropMesh.frustumCulled = false;
  backdropMesh.renderOrder = -40;
  scene.add(backdropMesh);
  applyLocalViewportCameraFrame({
    backdropMesh,
    camera,
    cameraState,
    hostElement,
  });

  const shellBackgroundLayers = backgroundLayers.map((layerConfig) => {
    const layer = createBackgroundLayer(layerConfig);
    scene.add(layer.group);
    registerDisposables(disposables, layer.geometry, layer.material);
    return layer;
  });

  const scenePass = createCompatibleScenePass(
    renderer,
    scene,
    camera,
    currentSsaaLevel,
  );
  const bloomNode = bloom(scenePass, bloomStrength, bloomRadius, bloomThreshold);
  const chromaticAberrationNode = rgbShift(scenePass.add(bloomNode), 0, 0);
  const outputFrame = renderOutput(
    chromaticAberrationNode,
    renderer.toneMapping,
    renderer.outputColorSpace,
  );
  const postProcessing = new RenderPipeline(renderer, outputFrame);
  postProcessing.outputColorTransform = false;
  registerDisposables(disposables, backdropGeometry, backdropMaterial, scenePass, bloomNode);

  return {
    backdropMesh,
    chromaticAberrationNode,
    disposables,
    postProcessing,
    scene,
    scenePass,
    backgroundLayers: shellBackgroundLayers,
  };
};
