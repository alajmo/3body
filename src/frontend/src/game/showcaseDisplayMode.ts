import type { ViewportDisplayMode } from "@3body/shared";
import {
  abs,
  clamp,
  convertToTexture,
  dot,
  float,
  fract,
  renderOutput,
  screenSize,
  sin,
  smoothstep,
  time,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { barrelUV, scanlines, vignette } from "three/addons/tsl/display/CRT.js";
import { rgbShift } from "three/addons/tsl/display/RGBShiftNode.js";
import type { Camera, Scene, WebGPURenderer } from "three/webgpu";
import { createCompatibleScenePass } from "./viewport/postProcessingCompat";

const BLOOM_RADIUS = 0.18;
const BLOOM_THRESHOLD = 0.82;
const DEFAULT_BLOOM_STRENGTH = 1.02;
const VHS_BLOOM_STRENGTH = 0.78;
const VHS_BARREL_DISTORTION = 0.044;
const VHS_DRIFT_WAVE_AMPLITUDE = 0.00012;
const VHS_DRIFT_TRACKING_AMPLITUDE = 0.00065;
const VHS_CURVED_OVERSCAN = 1.08;
const VHS_PHOSPHOR_STRIPE_SCALE = 0.34;
const VHS_PHOSPHOR_BASE = 0.91;
const VHS_PHOSPHOR_BOOST = 0.07;
const VHS_SCREEN_FALLOFF_INNER = 0.7;
const VHS_SCREEN_FALLOFF_OUTER = 0.98;

export const SHOWCASE_DISPLAY_MODE_OPTIONS = [
  { label: "Normal", value: "default" },
  { label: "VHS", value: "vhs" },
] as const;

export type ShowcaseDisplayMode = ViewportDisplayMode;

const createDefaultDisplayNode = (
  sceneNode: Parameters<typeof convertToTexture>[0],
) => rgbShift(sceneNode, 0, 0);

const createVhsDisplayNode = (
  sourceNode: Parameters<typeof convertToTexture>[0],
) => {
  const textureNode = convertToTexture(sourceNode);
  const uvNode = uv();
  const texelSize = vec2(1).div(screenSize);
  const barrelUv = barrelUV(float(VHS_BARREL_DISTORTION), uvNode);
  const horizontalDrift = sin(time.mul(4.8))
    .mul(VHS_DRIFT_WAVE_AMPLITUDE)
    .add(
      smoothstep(
        0.92,
        1,
        sin(time.mul(0.85).sub(uvNode.y.mul(6.4)))
          .mul(0.5)
          .add(0.5),
      ).mul(VHS_DRIFT_TRACKING_AMPLITUDE),
    );
  const distortedUv = barrelUv
    .sub(vec2(0.5))
    .mul(VHS_CURVED_OVERSCAN)
    .add(vec2(0.5))
    .add(vec2(horizontalDrift, 0));
  const sampleUv = distortedUv.clamp(vec2(0.001, 0.001), vec2(0.999, 0.999));
  const barrelKeepMask = distortedUv.x
    .greaterThan(0)
    .and(distortedUv.x.lessThan(1))
    .and(distortedUv.y.greaterThan(0))
    .and(distortedUv.y.lessThan(1))
    .select(float(1), float(0));
  const screenLocal = distortedUv.sub(vec2(0.5)).mul(2);
  const screenFaceMask = float(1).sub(
    smoothstep(
      VHS_SCREEN_FALLOFF_INNER,
      VHS_SCREEN_FALLOFF_OUTER,
      dot(screenLocal, screenLocal),
    ),
  );
  const phosphorPhase = fract(
    sampleUv.x.mul(screenSize.x).mul(VHS_PHOSPHOR_STRIPE_SCALE),
  );
  const phosphorR = float(1).sub(
    smoothstep(0.08, 0.22, abs(phosphorPhase.sub(0.16))),
  );
  const phosphorG = float(1).sub(
    smoothstep(0.08, 0.22, abs(phosphorPhase.sub(0.5))),
  );
  const phosphorB = float(1).sub(
    smoothstep(0.08, 0.22, abs(phosphorPhase.sub(0.84))),
  );
  const phosphorMask = vec3(
    float(VHS_PHOSPHOR_BASE).add(phosphorR.mul(VHS_PHOSPHOR_BOOST)),
    float(VHS_PHOSPHOR_BASE).add(phosphorG.mul(VHS_PHOSPHOR_BOOST)),
    float(VHS_PHOSPHOR_BASE).add(phosphorB.mul(VHS_PHOSPHOR_BOOST)),
  );
  const channelOffset = vec2(texelSize.x.mul(1.8), 0);
  const red = textureNode.sample(sampleUv.add(channelOffset)).r;
  const green = textureNode.sample(sampleUv).g;
  const blue = textureNode.sample(sampleUv.sub(channelOffset)).b;
  const alpha = textureNode.sample(sampleUv).a;
  const scanlineColor = scanlines(
    vec3(red, green, blue),
    float(0.24),
    float(320),
    float(0.08),
    sampleUv,
  );
  const noise = fract(
    sin(
      dot(
        sampleUv.mul(screenSize).add(vec2(time.mul(61.7), time.mul(13.3))),
        vec2(12.9898, 78.233),
      ),
    ).mul(43758.5453),
  )
    .sub(0.5)
    .mul(0.08);
  const trackedColor = clamp(scanlineColor.add(vec3(noise)), 0, 1)
    .mul(phosphorMask)
    .mul(screenFaceMask.mul(0.28).add(0.72));
  const finalColor = vignette(
    trackedColor,
    float(0.32),
    float(0.56),
    sampleUv,
  ).mul(barrelKeepMask);

  return vec4(finalColor, alpha);
};

export const createShowcaseDisplayPipeline = ({
  camera,
  mode,
  renderer,
  scene,
  sampleLevel,
}: {
  camera: Camera;
  mode: ShowcaseDisplayMode;
  renderer: WebGPURenderer;
  sampleLevel: number;
  scene: Scene;
}) => {
  const scenePass = createCompatibleScenePass(
    renderer,
    scene,
    camera,
    sampleLevel,
  );
  const disposables: Array<{ dispose: () => void }> = [scenePass];

  const bloomNode = bloom(
    scenePass,
    mode === "vhs" ? VHS_BLOOM_STRENGTH : DEFAULT_BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  disposables.push(bloomNode);
  const sceneNode = scenePass.add(bloomNode);
  const chromaticAberrationNode =
    mode === "vhs"
      ? rgbShift(createVhsDisplayNode(sceneNode), 0, 0)
      : createDefaultDisplayNode(sceneNode);

  return {
    chromaticAberrationNode,
    disposables,
    outputNode: renderOutput(
      chromaticAberrationNode,
      renderer.toneMapping,
      renderer.outputColorSpace,
    ),
  };
};
