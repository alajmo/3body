import {
  abs,
  color,
  float,
  length,
  max,
  mix,
  mx_cell_noise_float,
  mx_fractal_noise_float,
  positionLocal,
  sin,
  smoothstep,
  time,
  uniform,
  vec2,
  vec4,
} from "three/tsl";
import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  RingGeometry,
} from "three/webgpu";
import {
  SHIELD_GLOW_OUTER_SCALE,
  SHIELD_INNER_SCALE,
  SHIELD_OUTER_SCALE,
} from "./shieldPresentation";

const tintColor = (
  value: string,
  hueOffset: number,
  saturationOffset: number,
  lightnessOffset: number,
): Color => {
  const result = new Color(value);
  result.offsetHSL(hueOffset, saturationOffset, lightnessOffset);
  return result;
};

const createShieldArcMaterial = ({
  innerScale,
  outerScale,
  shieldColor,
}: {
  innerScale: number;
  outerScale: number;
  shieldColor: string;
}) => {
  const opacityUniform = uniform(1);
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
  });
  const bandSpan = Math.max(outerScale - innerScale, 0.001);
  const baseTint = tintColor(shieldColor, 0.01, -0.12, -0.02);
  const energyTint = tintColor(shieldColor, -0.04, 0.06, 0.28);
  const hotTint = tintColor(shieldColor, -0.06, 0.16, 0.76);
  const edgeTint = tintColor(shieldColor, 0.03, -0.2, -0.08);
  const localPos = positionLocal.xy;
  const radial = max(length(localPos), 0.001);
  const band = radial.sub(innerScale).div(bandSpan);
  const bandMask = smoothstep(0.02, 0.22, band).mul(
    float(1).sub(smoothstep(0.84, 0.98, band)),
  );
  const forwardMask = smoothstep(0.54, 0.998, positionLocal.x.div(radial));
  const edgeMask = smoothstep(0.18, 0.92, abs(positionLocal.y).div(radial));
  const spineMask = float(1).sub(
    smoothstep(0.08, 0.54, abs(positionLocal.y).div(radial)),
  );
  const flowNoise = mx_fractal_noise_float(
    localPos
      .mul(4.2)
      .toVar()
      .add(vec2(time.mul(0.34), time.mul(-0.22))),
    3,
    2,
    0.58,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const cellNoise = mx_cell_noise_float(
    localPos
      .mul(8.4)
      .toVar()
      .add(vec2(time.mul(0.26), time.mul(0.12))),
  )
    .mul(0.5)
    .add(0.5);
  const waveBands = sin(
    positionLocal.y
      .mul(4.4)
      .add(time.mul(5.4))
      .add(radial.mul(8.2))
      .add(flowNoise.mul(2.4)),
  )
    .mul(0.5)
    .add(0.5);
  const travelWave = sin(
    localPos.x
      .mul(2.8)
      .sub(localPos.y.mul(5.6))
      .sub(time.mul(7.4))
      .add(flowNoise.mul(2.8)),
  )
    .mul(0.5)
    .add(0.5);
  const energyFront = smoothstep(0.72, 0.985, travelWave);
  const gridA = float(1).sub(
    smoothstep(0.16, 0.68, abs(sin(localPos.x.mul(5.2).add(time.mul(0.12))))),
  );
  const gridB = float(1).sub(
    smoothstep(
      0.16,
      0.68,
      abs(
        sin(
          localPos.x
            .mul(3.1)
            .add(localPos.y.mul(5.2))
            .sub(time.mul(0.1)),
        ),
      ),
    ),
  );
  const gridC = float(1).sub(
    smoothstep(
      0.16,
      0.68,
      abs(
        sin(
          localPos.x
            .mul(3.1)
            .sub(localPos.y.mul(5.2))
            .add(time.mul(0.08)),
        ),
      ),
    ),
  );
  const lattice = max(gridA.mul(0.82), max(gridB, gridC)).mul(
    cellNoise.mul(0.48).add(0.32),
  );
  const pulse = sin(
    time.mul(5.2).add(forwardMask.mul(4.6)).add(flowNoise.mul(1.8)),
  )
    .mul(0.14)
    .add(0.9);
  const innerRim = float(1).sub(smoothstep(0.18, 0.38, band));
  const outerRim = smoothstep(0.68, 0.94, band);
  const baseColor = mix(
    color(baseTint),
    color(energyTint),
    flowNoise.mul(0.32).add(waveBands.mul(0.18)).add(float(0.16)),
  );
  const faceColor = mix(
    baseColor,
    color(hotTint),
    lattice.mul(0.28)
      .add(innerRim.mul(spineMask).mul(0.22))
      .add(energyFront.mul(spineMask).mul(0.18)),
  );
  const edgedColor = mix(faceColor, color(edgeTint), outerRim.mul(0.18));
  const alpha = bandMask
    .mul(opacityUniform)
    .mul(pulse)
    .mul(forwardMask.mul(0.22).add(0.78))
    .mul(waveBands.mul(0.1).add(0.9))
    .mul(flowNoise.mul(0.08).add(0.92))
    .mul(lattice.mul(0.12).add(0.9))
    .mul(energyFront.mul(0.08).add(0.92));

  material.fragmentNode = vec4(
    edgedColor.mul(
      mix(float(0.94), float(1.38), forwardMask)
        .mul(waveBands.mul(0.08).add(0.92))
        .mul(flowNoise.mul(0.08).add(0.92))
        .mul(lattice.mul(0.22).add(0.9))
        .mul(energyFront.mul(0.26).add(0.92))
        .mul(innerRim.mul(spineMask).mul(0.12).add(0.96))
        .mul(edgeMask.mul(0.04).add(0.96)),
    ),
    alpha,
  );
  material.alphaTest = 0.01;

  return {
    material,
    opacityUniform,
  };
};

const createShieldGlowMaterial = ({
  glowOuterScale,
  outerScale,
  shieldColor,
}: {
  glowOuterScale: number;
  outerScale: number;
  shieldColor: string;
}) => {
  const opacityUniform = uniform(1);
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const glowInnerScale = outerScale * 0.84;
  const bandSpan = Math.max(glowOuterScale - glowInnerScale, 0.001);
  const coreTint = tintColor(shieldColor, -0.04, 0.08, 0.38);
  const haloTint = tintColor(shieldColor, 0.02, -0.14, 0.02);
  const flareTint = tintColor(shieldColor, -0.06, 0.12, 0.74);
  const localPos = positionLocal.xy;
  const radial = max(length(localPos), 0.001);
  const band = radial.sub(glowInnerScale).div(bandSpan);
  const bandMask = smoothstep(0.02, 0.22, band).mul(
    float(1).sub(smoothstep(0.86, 1, band)),
  );
  const forwardMask = smoothstep(0.5, 0.995, positionLocal.x.div(radial));
  const sweep = sin(
    positionLocal.y.mul(2.8).sub(time.mul(5.2)).add(radial.mul(6.8)),
  )
    .mul(0.5)
    .add(0.5);
  const haze = mx_fractal_noise_float(
    localPos
      .mul(3.4)
      .toVar()
      .add(vec2(time.mul(0.28), time.mul(-0.18))),
    3,
    2,
    0.58,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const wave = sin(radial.mul(9.6).add(time.mul(4.8)).add(positionLocal.y.mul(2.1)))
    .mul(0.5)
    .add(0.5);
  const pulse = sin(
    time.mul(5.1).add(haze.mul(1.9)).add(forwardMask.mul(4.2)),
  )
    .mul(0.18)
    .add(0.9);
  const glowColor = mix(
    color(haloTint),
    color(coreTint),
    forwardMask.mul(0.34).add(sweep.mul(0.12)).add(wave.mul(0.08)),
  );
  const finalColor = mix(
    glowColor,
    color(flareTint),
    forwardMask.mul(sweep).mul(0.32),
  );
  const alpha = bandMask
    .mul(opacityUniform)
    .mul(pulse)
    .mul(forwardMask.mul(0.2).add(0.2))
    .mul(sweep.mul(0.1).add(0.9))
    .mul(haze.mul(0.12).add(0.88))
    .mul(wave.mul(0.08).add(0.92));

  material.fragmentNode = vec4(
    finalColor
      .mul(haze.mul(0.12).add(0.9))
      .mul(pulse.mul(1.18))
      .mul(wave.mul(0.1).add(0.92)),
    alpha,
  );
  material.alphaTest = 0.01;

  return {
    material,
    opacityUniform,
  };
};

const createShieldPanelMaterial = ({
  innerScale,
  outerScale,
  shieldColor,
}: {
  innerScale: number;
  outerScale: number;
  shieldColor: string;
}) => {
  const opacityUniform = uniform(1);
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const bandSpan = Math.max(outerScale - innerScale, 0.001);
  const panelTint = tintColor(shieldColor, -0.02, 0.02, 0.18);
  const lineTint = tintColor(shieldColor, -0.05, 0.16, 0.78);
  const edgeTint = tintColor(shieldColor, 0.05, -0.2, 0.02);
  const localPos = positionLocal.xy;
  const radial = max(length(localPos), 0.001);
  const band = radial.sub(innerScale).div(bandSpan);
  const shellMask = smoothstep(0.08, 0.22, band).mul(
    float(1).sub(smoothstep(0.78, 0.9, band)),
  );
  const forwardMask = smoothstep(0.56, 0.998, positionLocal.x.div(radial));
  const scan = sin(
    localPos.x.mul(4.2).sub(time.mul(6.4)).add(localPos.y.mul(1.2)),
  )
    .mul(0.5)
    .add(0.5);
  const verticalLines = float(1).sub(
    smoothstep(0.14, 0.58, abs(sin(localPos.x.mul(4.2).add(time.mul(0.1))))),
  );
  const diagLinesA = float(1).sub(
    smoothstep(
      0.14,
      0.58,
      abs(
        sin(
          localPos.x
            .mul(2.1)
            .add(localPos.y.mul(3.6))
            .sub(time.mul(0.08)),
        ),
      ),
    ),
  );
  const diagLinesB = float(1).sub(
    smoothstep(
      0.14,
      0.58,
      abs(
        sin(
          localPos.x
            .mul(2.1)
            .sub(localPos.y.mul(3.6))
            .add(time.mul(0.06)),
        ),
      ),
    ),
  );
  const cellNoise = mx_cell_noise_float(
    localPos
      .mul(6.8)
      .toVar()
      .add(vec2(time.mul(0.18), time.mul(-0.12))),
  )
    .mul(0.5)
    .add(0.5);
  const panelGrid = max(
    verticalLines.mul(0.82),
    max(diagLinesA, diagLinesB),
  ).mul(cellNoise.mul(0.56).add(0.28));
  const scanRidge = smoothstep(0.72, 0.98, scan);
  const activeCells = smoothstep(0.7, 0.96, cellNoise.add(scan.mul(0.16)));
  const baseColor = mix(
    color(edgeTint),
    color(panelTint),
    forwardMask.mul(0.2).add(scan.mul(0.08)),
  );
  const energizedColor = mix(
    baseColor,
    color(lineTint),
    panelGrid.mul(0.68).add(activeCells.mul(0.18)).add(scanRidge.mul(0.1)),
  );
  const alpha = shellMask
    .mul(forwardMask)
    .mul(opacityUniform)
    .mul(panelGrid.mul(0.46).add(activeCells.mul(0.1)).add(scanRidge.mul(0.1)).add(0.04))
    .mul(scan.mul(0.12).add(0.88));

  material.fragmentNode = vec4(
    energizedColor
      .mul(panelGrid.mul(0.34).add(0.92))
      .mul(activeCells.mul(0.18).add(0.94))
      .mul(scanRidge.mul(0.16).add(1)),
    alpha,
  );
  material.alphaTest = 0.01;

  return {
    material,
    opacityUniform,
  };
};

const createShieldCrestMaterial = ({
  innerScale,
  outerScale,
  shieldColor,
}: {
  innerScale: number;
  outerScale: number;
  shieldColor: string;
}) => {
  const opacityUniform = uniform(1);
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const bandSpan = Math.max(outerScale - innerScale, 0.001);
  const coreTint = tintColor(shieldColor, -0.05, 0.16, 0.82);
  const edgeTint = tintColor(shieldColor, 0.02, -0.14, 0.18);
  const localPos = positionLocal.xy;
  const radial = max(length(localPos), 0.001);
  const band = radial.sub(innerScale).div(bandSpan);
  const forwardMask = smoothstep(0.74, 0.999, positionLocal.x.div(radial));
  const centerlineMask = float(1).sub(
    smoothstep(0.05, 0.34, abs(positionLocal.y).div(radial)),
  );
  const bandMask = smoothstep(0.18, 0.34, band).mul(
    float(1).sub(smoothstep(0.7, 0.86, band)),
  );
  const flow = mx_fractal_noise_float(
    localPos
      .mul(6.2)
      .toVar()
      .add(vec2(time.mul(-0.38), time.mul(0.24))),
    3,
    2,
    0.56,
    1,
  )
    .mul(0.5)
    .add(0.5);
  const sweep = sin(
    band
      .mul(20)
      .sub(time.mul(10.4))
      .add(positionLocal.y.mul(6.8))
      .add(flow.mul(3.2)),
  )
    .mul(0.5)
    .add(0.5);
  const crestMask = bandMask
    .mul(forwardMask)
    .mul(centerlineMask.mul(0.7).add(0.3));
  const crestColor = mix(
    color(edgeTint),
    color(coreTint),
    centerlineMask.mul(0.48).add(sweep.mul(0.12)),
  );
  const alpha = crestMask
    .mul(opacityUniform)
    .mul(sweep.mul(0.28).add(0.62))
    .mul(flow.mul(0.18).add(0.82));

  material.fragmentNode = vec4(
    mix(crestColor, color("#effbff"), centerlineMask.mul(0.42).add(sweep.mul(0.24)))
      .mul(sweep.mul(0.28).add(1.06))
      .mul(forwardMask.mul(0.3).add(1.06)),
    alpha,
  );
  material.alphaTest = 0.01;

  return {
    material,
    opacityUniform,
  };
};

export const createShieldVisual = ({
  arcDeg,
  glowOuterScale = SHIELD_GLOW_OUTER_SCALE,
  innerScale = SHIELD_INNER_SCALE,
  outerScale = SHIELD_OUTER_SCALE,
  shieldColor,
}: {
  arcDeg: number;
  glowOuterScale?: number;
  innerScale?: number;
  outerScale?: number;
  shieldColor: string;
}) => {
  const shieldArcRadians = (arcDeg * Math.PI) / 180;
  const bandSpan = Math.max(outerScale - innerScale, 0.001);
  const shieldGlow = createShieldGlowMaterial({
    glowOuterScale,
    outerScale,
    shieldColor,
  });
  const shieldArc = createShieldArcMaterial({
    innerScale,
    outerScale,
    shieldColor,
  });
  const shieldPanel = createShieldPanelMaterial({
    innerScale,
    outerScale,
    shieldColor,
  });
  const shieldCrest = createShieldCrestMaterial({
    innerScale,
    outerScale,
    shieldColor,
  });
  const glowMesh = new Mesh(
    new RingGeometry(
      outerScale * 0.84,
      glowOuterScale,
      72,
      1,
      -shieldArcRadians / 2,
      shieldArcRadians,
    ),
    shieldGlow.material,
  );
  const arcMesh = new Mesh(
    new RingGeometry(
      innerScale,
      outerScale,
      72,
      1,
      -shieldArcRadians / 2,
      shieldArcRadians,
    ),
    shieldArc.material,
  );
  const crestMesh = new Mesh(
    new RingGeometry(
      innerScale + bandSpan * 0.08,
      outerScale - bandSpan * 0.02,
      96,
      1,
      -shieldArcRadians / 2,
      shieldArcRadians,
    ),
    shieldCrest.material,
  );
  const panelMesh = new Mesh(
    new RingGeometry(
      innerScale + bandSpan * 0.04,
      outerScale - bandSpan * 0.07,
      96,
      1,
      -shieldArcRadians / 2,
      shieldArcRadians,
    ),
    shieldPanel.material,
  );

  glowMesh.renderOrder = 11;
  arcMesh.renderOrder = 12;
  panelMesh.renderOrder = 13;
  crestMesh.renderOrder = 14;
  glowMesh.position.z = 2.6;
  arcMesh.position.z = 2.8;
  panelMesh.position.z = 2.94;
  crestMesh.position.z = 3.08;

  const group = new Group();
  group.add(glowMesh, arcMesh, panelMesh, crestMesh);

  return {
    shieldArcMaterial: shieldArc.material,
    shieldArcMesh: arcMesh,
    shieldArcOpacityUniform: shieldArc.opacityUniform,
    shieldPanelMaterial: shieldPanel.material,
    shieldPanelMesh: panelMesh,
    shieldPanelOpacityUniform: shieldPanel.opacityUniform,
    shieldCrestMaterial: shieldCrest.material,
    shieldCrestMesh: crestMesh,
    shieldCrestOpacityUniform: shieldCrest.opacityUniform,
    shieldGlowMaterial: shieldGlow.material,
    shieldGlowMesh: glowMesh,
    shieldGlowOpacityUniform: shieldGlow.opacityUniform,
    shieldGroup: group,
  };
};
