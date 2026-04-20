import {
  Mesh,
  type MeshBasicNodeMaterial,
  type OrthographicCamera,
  PlaneGeometry,
  RenderPipeline,
  Scene,
  type WebGPURenderer,
} from "three/webgpu";
import {
  createShowcaseDisplayPipeline,
  type ShowcaseDisplayMode,
} from "../showcaseDisplayMode";
import {
  type LocalViewportCameraState,
  applyLocalViewportCameraFrame,
} from "./localViewportCamera";
import { registerViewportDisposables } from "./disposables";

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
  kind: "dust" | "stars";
  parallax: number;
  size: number;
  twinkleAmount: number;
  warmColor: string;
  z: number;
}

export const createLocalViewportRenderShell = ({
  camera,
  cameraState,
  createBackgroundLayer,
  currentSsaaLevel,
  displayMode,
  hostElement,
  renderer,
  backdropMaterial,
  sceneBackground,
  backgroundLayers,
}: {
  camera: OrthographicCamera;
  cameraState: LocalViewportCameraState;
  backdropMaterial: MeshBasicNodeMaterial;
  createBackgroundLayer: (config: StarfieldLayerConfig) => StarfieldLayerVisual;
  currentSsaaLevel: number;
  displayMode: ShowcaseDisplayMode;
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
    registerViewportDisposables(disposables, layer.geometry, layer.material);
    return layer;
  });

  const {
    chromaticAberrationNode,
    disposables: effectDisposables,
    outputNode,
  } = createShowcaseDisplayPipeline({
    camera,
    mode: displayMode,
    renderer,
    sampleLevel: currentSsaaLevel,
    scene,
  });
  const postProcessing = new RenderPipeline(renderer, outputNode);
  postProcessing.outputColorTransform = false;
  registerViewportDisposables(
    disposables,
    backdropGeometry,
    backdropMaterial,
    ...effectDisposables,
  );

  return {
    backdropMesh,
    chromaticAberrationNode,
    disposables,
    postProcessing,
    scene,
    backgroundLayers: shellBackgroundLayers,
  };
};
