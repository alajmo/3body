import {
  DEFAULT_VIEWPORT_DISPLAY_MODE,
  sanitizeViewportDisplayMode,
  type ViewportDisplayMode,
} from "@3body/shared";
import {
  clamp,
  convertToTexture,
  dot,
  float,
  fract,
  luminance,
  max,
  posterize,
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
import { pixelationPass } from "three/addons/tsl/display/PixelationPassNode.js";
import { rgbShift } from "three/addons/tsl/display/RGBShiftNode.js";
import { sobel } from "three/addons/tsl/display/SobelOperatorNode.js";
import type { Camera, Scene, WebGPURenderer } from "three/webgpu";
import { createCompatibleScenePass } from "./viewport/postProcessingCompat";

const BLOOM_RADIUS = 0.18;
const BLOOM_THRESHOLD = 0.82;
const DEFAULT_BLOOM_STRENGTH = 1.02;
const VHS_BLOOM_STRENGTH = 0.78;
const PIXEL_ART_SIZE = 6;
const PIXEL_ART_NORMAL_EDGE_STRENGTH = 0.16;
const PIXEL_ART_DEPTH_EDGE_STRENGTH = 0.22;
const PIXEL_ART_POSTERIZE_STEPS = float(7);

export const SHOWCASE_DISPLAY_MODE_OPTIONS = [
  { label: "Default", value: "default" },
  { label: "VHS", value: "vhs" },
  { label: "Pixel Art", value: "pixelArt" },
  { label: "Vector Asteroids", value: "vectorAsteroids" },
] as const;

export type ShowcaseDisplayMode = ViewportDisplayMode;

export const DEFAULT_SHOWCASE_DISPLAY_MODE = DEFAULT_VIEWPORT_DISPLAY_MODE;

export const sanitizeShowcaseDisplayMode = sanitizeViewportDisplayMode;

const createDefaultDisplayNode = (
  sceneNode: Parameters<typeof convertToTexture>[0],
) => rgbShift(sceneNode, 0, 0);

const createVhsDisplayNode = (
  sourceNode: Parameters<typeof convertToTexture>[0],
) => {
  const textureNode = convertToTexture(sourceNode);
  const uvNode = uv();
  const texelSize = vec2(1).div(screenSize);
  const barrelUv = barrelUV(float(0.06), uvNode);
  const horizontalDrift = sin(uvNode.y.mul(34).add(time.mul(12)))
    .mul(0.0016)
    .add(
      smoothstep(
        0.92,
        1,
        sin(time.mul(0.85).sub(uvNode.y.mul(6.4)))
          .mul(0.5)
          .add(0.5),
      ).mul(0.0032),
    );
  const sampleUv = barrelUv
    .add(vec2(horizontalDrift, 0))
    .clamp(vec2(0.001, 0.001), vec2(0.999, 0.999));
  const barrelKeepMask = sampleUv.x
    .greaterThan(0)
    .and(sampleUv.x.lessThan(1))
    .and(sampleUv.y.greaterThan(0))
    .and(sampleUv.y.lessThan(1))
    .select(float(1), float(0));
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
  const trackedColor = clamp(scanlineColor.add(vec3(noise)), 0, 1);
  const finalColor = vignette(
    trackedColor,
    float(0.32),
    float(0.56),
    sampleUv,
  ).mul(barrelKeepMask);

  return vec4(finalColor, alpha);
};

const createVectorAsteroidsDisplayNode = (
  sourceNode: Parameters<typeof convertToTexture>[0],
) => {
  const uvNode = uv();
  const sobelTexture = convertToTexture(sobel(sourceNode));
  const textureNode = convertToTexture(sourceNode);
  const sceneSample = textureNode.sample(uvNode);
  const edgeMask = smoothstep(
    0.08,
    0.22,
    luminance(sobelTexture.sample(uvNode).rgb),
  );
  const highlightMask = smoothstep(0.62, 0.92, luminance(sceneSample.rgb)).mul(
    float(0.18),
  );
  const phosphorPulse = sin(time.mul(14)).mul(0.04).add(0.96);
  const scanlinePulse = sin(uv().y.mul(screenSize.y.mul(0.48)).add(time.mul(6)))
    .mul(0.025)
    .add(0.975);
  const lineMask = clamp(
    max(edgeMask, highlightMask).mul(phosphorPulse).mul(scanlinePulse),
    0,
    1,
  );

  return vec4(vec3(lineMask), float(1));
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
  if (mode === "pixelArt") {
    const pixelPass = pixelationPass(
      scene,
      camera,
      PIXEL_ART_SIZE,
      PIXEL_ART_NORMAL_EDGE_STRENGTH,
      PIXEL_ART_DEPTH_EDGE_STRENGTH,
    );
    const pixelArtColor = posterize(
      pixelPass.rgb.mul(1.05),
      PIXEL_ART_POSTERIZE_STEPS,
    );
    const chromaticAberrationNode = rgbShift(
      vec4(pixelArtColor, float(1)),
      0,
      0,
    );

    return {
      chromaticAberrationNode,
      disposables: [pixelPass] as Array<{ dispose: () => void }>,
      outputNode: renderOutput(
        chromaticAberrationNode,
        renderer.toneMapping,
        renderer.outputColorSpace,
      ),
    };
  }

  const scenePass = createCompatibleScenePass(
    renderer,
    scene,
    camera,
    sampleLevel,
  );
  const disposables: Array<{ dispose: () => void }> = [scenePass];

  if (mode === "vectorAsteroids") {
    const chromaticAberrationNode = rgbShift(
      createVectorAsteroidsDisplayNode(scenePass),
      0,
      0,
    );

    return {
      chromaticAberrationNode,
      disposables,
      outputNode: renderOutput(
        chromaticAberrationNode,
        renderer.toneMapping,
        renderer.outputColorSpace,
      ),
    };
  }

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
