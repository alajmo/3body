import {
  ARENA_RADIUS,
  EPS2,
  G,
  SIM_HZ,
  SUN_MASS,
  add,
  dist,
  len,
  normalize,
  rot,
  scale,
  stepBody,
  stepSuns,
} from "@3body/shared";
import type { EntityBase, Sun, Vec2 } from "@3body/shared";
import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  PointsNodeMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGPURenderer,
} from "three/webgpu";
import { attribute, color, mix, uv } from "three/tsl";

const CAMERA_DISTANCE = 100;
const MAX_PIXEL_RATIO = 2;
const VISIBLE_WORLD_HEIGHT = ARENA_RADIUS * 2.25;
const FIXED_STEP_SEC = 1 / SIM_HZ;
const MAX_FRAME_DELTA_SEC = 0.1;
const MAX_STEPS_PER_FRAME = 12;
const SUN_RADIUS = 150;
const PLANET_RADIUS = 38;
const SUN_ORBIT_RADIUS = 620;
const PLANET_START_RADIUS = 1600;
const PLANET_START_SPEED = 520;
const PLANET_START_ANGLE_RAD = 1;
const PLANET_START_RADIAL_KICK = -30;
const PLANET_RESET_RADIUS = ARENA_RADIUS * 1.12;
const ARENA_RING_HALF_THICKNESS = 18;
const TRAIL_DURATION_SEC = 3;
const TRAIL_POINT_SIZE = 18;
const MAX_TRAIL_SAMPLES = Math.ceil(TRAIL_DURATION_SEC * 240) + 8;
const SCENE_BACKGROUND = new Color("#05070b");
const WORLD_ORIGIN = { x: 0, y: 0 } satisfies Vec2;
const SUN_COLORS = ["#ffd36a", "#ffb347", "#fff1a1"] as const;

interface SandboxPlanet extends EntityBase {
  kind: "planet";
}

interface SandboxState {
  tick: number;
  elapsedSec: number;
  suns: Sun[];
  planet: SandboxPlanet;
}

interface TrailSample {
  pos: Vec2;
  timeSec: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, alpha: number): number =>
  start + (end - start) * alpha;

const lerpVec2 = (start: Vec2, end: Vec2, alpha: number): Vec2 => ({
  x: lerp(start.x, end.x, alpha),
  y: lerp(start.y, end.y, alpha),
});

const makeTangentialVelocity = (pos: Vec2, speed: number): Vec2 =>
  scale(normalize(rot(pos, Math.PI / 2)), speed);

const computeStableSunSpeed = (orbitRadius: number): number =>
  Math.sqrt(
    (Math.sqrt(3) * G * SUN_MASS * orbitRadius) /
      (3 * orbitRadius * orbitRadius + EPS2),
  );

const createSandboxState = (): SandboxState => {
  const sunSpeed = computeStableSunSpeed(SUN_ORBIT_RADIUS);

  // Equal-mass equilateral orbits blow up quickly once perturbed, so keep the
  // suns on the softened circular solution and let the planet provide the
  // sandbox's non-repeating motion.
  const suns: Sun[] = Array.from({ length: 3 }, (_, index) => {
    const angle = index * ((Math.PI * 2) / 3);
    const pos = {
      x: Math.cos(angle) * SUN_ORBIT_RADIUS,
      y: Math.sin(angle) * SUN_ORBIT_RADIUS,
    };

    return {
      id: index + 1,
      kind: "sun",
      mass: SUN_MASS,
      radius: SUN_RADIUS,
      pos,
      vel: makeTangentialVelocity(pos, sunSpeed),
    };
  });

  const planetPos = {
    x: Math.cos(PLANET_START_ANGLE_RAD) * PLANET_START_RADIUS,
    y: Math.sin(PLANET_START_ANGLE_RAD) * PLANET_START_RADIUS,
  };

  const planet: SandboxPlanet = {
    id: 4,
    kind: "planet",
    radius: PLANET_RADIUS,
    pos: planetPos,
    vel: add(
      makeTangentialVelocity(planetPos, PLANET_START_SPEED),
      scale(normalize(planetPos), PLANET_START_RADIAL_KICK),
    ),
  };

  return {
    tick: 0,
    elapsedSec: 0,
    suns,
    planet,
  };
};

const stepSandbox = (state: SandboxState): SandboxState => {
  const suns = stepSuns(state.suns, FIXED_STEP_SEC);

  return {
    tick: state.tick + 1,
    elapsedSec: state.elapsedSec + FIXED_STEP_SEC,
    suns,
    planet: stepBody(state.planet, suns, FIXED_STEP_SEC),
  };
};

const shouldResetSandbox = (state: SandboxState): boolean => {
  if (len(state.planet.pos) > PLANET_RESET_RADIUS) {
    return true;
  }

  for (const sun of state.suns) {
    if (dist(state.planet.pos, sun.pos) <= state.planet.radius + sun.radius) {
      return true;
    }
  }

  for (let index = 0; index < state.suns.length; index += 1) {
    for (
      let otherIndex = index + 1;
      otherIndex < state.suns.length;
      otherIndex += 1
    ) {
      if (
        dist(state.suns[index]!.pos, state.suns[otherIndex]!.pos) <=
        state.suns[index]!.radius + state.suns[otherIndex]!.radius
      ) {
        return true;
      }
    }
  }

  return false;
};

const interpolateSandboxState = (
  previousState: SandboxState,
  currentState: SandboxState,
  alpha: number,
): SandboxState => ({
  tick: currentState.tick,
  elapsedSec: lerp(previousState.elapsedSec, currentState.elapsedSec, alpha),
  suns: currentState.suns.map((sun, index) => ({
    ...sun,
    pos: lerpVec2(previousState.suns[index]!.pos, sun.pos, alpha),
    vel: lerpVec2(previousState.suns[index]!.vel, sun.vel, alpha),
  })),
  planet: {
    ...currentState.planet,
    pos: lerpVec2(previousState.planet.pos, currentState.planet.pos, alpha),
    vel: lerpVec2(previousState.planet.vel, currentState.planet.vel, alpha),
  },
});

const resetTrail = (
  trailSamples: TrailSample[],
  trailGeometry: BufferGeometry,
  trailPositionAttribute: Float32BufferAttribute,
  trailOpacityAttribute: Float32BufferAttribute,
) => {
  trailSamples.length = 0;
  trailGeometry.setDrawRange(0, 0);
  trailPositionAttribute.needsUpdate = true;
  trailOpacityAttribute.needsUpdate = true;
};

const appendTrailSample = (
  trailSamples: TrailSample[],
  pos: Vec2,
  timeSec: number,
) => {
  trailSamples.push({
    pos: { x: pos.x, y: pos.y },
    timeSec,
  });

  while (
    trailSamples.length > 0 &&
    timeSec - trailSamples[0]!.timeSec > TRAIL_DURATION_SEC
  ) {
    trailSamples.shift();
  }

  while (trailSamples.length > MAX_TRAIL_SAMPLES) {
    trailSamples.shift();
  }
};

const updateTrailGeometry = (
  trailSamples: TrailSample[],
  nowSec: number,
  trailGeometry: BufferGeometry,
  trailPositionAttribute: Float32BufferAttribute,
  trailOpacityAttribute: Float32BufferAttribute,
) => {
  const positionArray = trailPositionAttribute.array as Float32Array;
  const opacityArray = trailOpacityAttribute.array as Float32Array;

  for (let index = 0; index < trailSamples.length; index += 1) {
    const sample = trailSamples[index]!;
    const ageSec = nowSec - sample.timeSec;
    const alpha = clamp(1 - ageSec / TRAIL_DURATION_SEC, 0, 1);
    const offset = index * 3;

    positionArray[offset] = sample.pos.x;
    positionArray[offset + 1] = sample.pos.y;
    positionArray[offset + 2] = 0;
    opacityArray[index] = alpha;
  }

  trailGeometry.setDrawRange(0, trailSamples.length);
  trailPositionAttribute.needsUpdate = true;
  trailOpacityAttribute.needsUpdate = true;
};

export function createGameViewport(hostElement: HTMLDivElement): () => void {
  let disposed = false;
  let renderer: WebGPURenderer | null = null;
  let camera: OrthographicCamera | null = null;
  const disposables: Array<{ dispose: () => void }> = [];

  const resizeViewport = () => {
    if (renderer === null || camera === null) {
      return;
    }

    const width = Math.max(1, hostElement.clientWidth);
    const height = Math.max(1, hostElement.clientHeight);
    const aspect = width / height;
    const worldHalfHeight = VISIBLE_WORLD_HEIGHT / 2;
    const worldHalfWidth = worldHalfHeight * aspect;

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
    );
    renderer.setSize(width, height, false);

    camera.left = -worldHalfWidth;
    camera.right = worldHalfWidth;
    camera.top = worldHalfHeight;
    camera.bottom = -worldHalfHeight;
    camera.updateProjectionMatrix();
  };

  void (async () => {
    try {
      const nextRenderer = new WebGPURenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
      await nextRenderer.init();

      if (disposed) {
        nextRenderer.dispose();
        return;
      }

      nextRenderer.outputColorSpace = SRGBColorSpace;
      nextRenderer.domElement.className = "game-canvas";
      renderer = nextRenderer;

      const scene = new Scene();
      scene.background = SCENE_BACKGROUND.clone();

      const nextCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      nextCamera.position.set(0, 0, CAMERA_DISTANCE);
      nextCamera.lookAt(0, 0, 0);
      camera = nextCamera;

      const backdropGeometry = new PlaneGeometry(
        VISIBLE_WORLD_HEIGHT * 2.6,
        VISIBLE_WORLD_HEIGHT * 2.6,
      );
      const backdropMaterial = new MeshBasicNodeMaterial();
      backdropMaterial.colorNode = mix(
        color("#020307"),
        color("#0c1d38"),
        uv().y,
      );
      const backdropMesh = new Mesh(backdropGeometry, backdropMaterial);
      backdropMesh.position.set(0, 0, -28);
      scene.add(backdropMesh);

      const arenaGeometry = new RingGeometry(
        ARENA_RADIUS - ARENA_RING_HALF_THICKNESS,
        ARENA_RADIUS + ARENA_RING_HALF_THICKNESS,
        192,
      );
      const arenaMaterial = new MeshBasicMaterial({
        color: "#103458",
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const arenaMesh = new Mesh(arenaGeometry, arenaMaterial);
      arenaMesh.position.set(0, 0, -12);
      scene.add(arenaMesh);

      const sunGeometry = new SphereGeometry(SUN_RADIUS, 32, 32);
      const sunMaterials = SUN_COLORS.map(
        (sunColor) =>
          new MeshBasicMaterial({
            color: sunColor,
            transparent: true,
            opacity: 0.96,
          }),
      );
      const sunMeshes = sunMaterials.map((sunMaterial) => {
        const sunMesh = new Mesh(sunGeometry, sunMaterial);
        scene.add(sunMesh);
        return sunMesh;
      });

      const planetGeometry = new SphereGeometry(PLANET_RADIUS, 28, 28);
      const planetMaterial = new MeshBasicMaterial({
        color: "#8ad8ff",
      });
      const planetMesh = new Mesh(planetGeometry, planetMaterial);
      scene.add(planetMesh);

      const trailGeometry = new BufferGeometry();
      const trailPositions = new Float32Array(MAX_TRAIL_SAMPLES * 3);
      const trailOpacities = new Float32Array(MAX_TRAIL_SAMPLES);
      const trailPositionAttribute = new Float32BufferAttribute(
        trailPositions,
        3,
      );
      const trailOpacityAttribute = new Float32BufferAttribute(
        trailOpacities,
        1,
      );
      trailPositionAttribute.setUsage(DynamicDrawUsage);
      trailOpacityAttribute.setUsage(DynamicDrawUsage);
      trailGeometry.setAttribute("position", trailPositionAttribute);
      trailGeometry.setAttribute("trailOpacity", trailOpacityAttribute);
      trailGeometry.setDrawRange(0, 0);

      const trailMaterial = new PointsNodeMaterial();
      trailMaterial.colorNode = color("#79d6ff");
      trailMaterial.opacityNode = attribute("trailOpacity", "float");
      trailMaterial.size = TRAIL_POINT_SIZE;
      trailMaterial.transparent = true;
      trailMaterial.depthWrite = false;
      trailMaterial.alphaTest = 0.01;
      const trailPoints = new Points(trailGeometry, trailMaterial);
      trailPoints.frustumCulled = false;
      trailPoints.position.z = -2;
      scene.add(trailPoints);

      disposables.push(
        backdropGeometry,
        backdropMaterial,
        arenaGeometry,
        arenaMaterial,
        sunGeometry,
        ...sunMaterials,
        planetGeometry,
        planetMaterial,
        trailGeometry,
        trailMaterial,
      );

      let previousState = createSandboxState();
      let currentState = previousState;
      let accumulatorSec = 0;
      let previousFrameTimeSec: number | null = null;
      const trailSamples: TrailSample[] = [];

      const resetSandbox = () => {
        previousState = createSandboxState();
        currentState = previousState;
        accumulatorSec = 0;
        resetTrail(
          trailSamples,
          trailGeometry,
          trailPositionAttribute,
          trailOpacityAttribute,
        );
      };

      hostElement.replaceChildren(nextRenderer.domElement);
      resizeViewport();
      window.addEventListener("resize", resizeViewport);

      nextRenderer.setAnimationLoop((timeMs = performance.now()) => {
        const nowSec = timeMs * 0.001;

        if (previousFrameTimeSec === null) {
          previousFrameTimeSec = nowSec;
        }

        const frameDeltaSec = clamp(
          nowSec - previousFrameTimeSec,
          0,
          MAX_FRAME_DELTA_SEC,
        );
        previousFrameTimeSec = nowSec;
        accumulatorSec += frameDeltaSec;

        let stepCount = 0;

        while (
          accumulatorSec >= FIXED_STEP_SEC &&
          stepCount < MAX_STEPS_PER_FRAME
        ) {
          const nextState = stepSandbox(currentState);

          if (shouldResetSandbox(nextState)) {
            resetSandbox();
            break;
          }

          previousState = currentState;
          currentState = nextState;
          accumulatorSec -= FIXED_STEP_SEC;
          stepCount += 1;
        }

        if (stepCount === MAX_STEPS_PER_FRAME) {
          accumulatorSec = 0;
        }

        const renderState = interpolateSandboxState(
          previousState,
          currentState,
          clamp(accumulatorSec / FIXED_STEP_SEC, 0, 1),
        );

        for (let index = 0; index < sunMeshes.length; index += 1) {
          const sunMesh = sunMeshes[index]!;
          const sun = renderState.suns[index]!;
          sunMesh.position.set(sun.pos.x, sun.pos.y, 0);
        }

        planetMesh.position.set(
          renderState.planet.pos.x,
          renderState.planet.pos.y,
          0,
        );
        appendTrailSample(trailSamples, renderState.planet.pos, nowSec);
        updateTrailGeometry(
          trailSamples,
          nowSec,
          trailGeometry,
          trailPositionAttribute,
          trailOpacityAttribute,
        );

        nextRenderer.render(scene, nextCamera);
      });
    } catch (error) {
      console.error("[frontend] Failed to initialize TSL viewport.", error);

      if (!disposed) {
        hostElement.textContent = "Renderer initialization failed.";
      }
    }
  })();

  return () => {
    disposed = true;
    window.removeEventListener("resize", resizeViewport);

    if (renderer !== null) {
      renderer.setAnimationLoop(null);
      renderer.dispose();
    }

    for (const disposable of disposables) {
      disposable.dispose();
    }

    hostElement.replaceChildren();
  };
}
