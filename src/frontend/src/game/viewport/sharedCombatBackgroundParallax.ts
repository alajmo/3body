export interface SharedCombatBackgroundLayerHost {
  driftX: number;
  driftY: number;
  group: {
    position: {
      x: number;
      y: number;
    };
  };
  parallax: number;
  tileSize: number;
}

const wrapCentered = (value: number, span: number): number => {
  if (!(span > 0)) {
    return value;
  }

  return ((((value + span / 2) % span) + span) % span) - span / 2;
};

export const syncSharedCombatBackgroundParallax = ({
  backgroundLayers,
  nowSec,
  renderCenterX,
  renderCenterY,
}: {
  backgroundLayers: readonly SharedCombatBackgroundLayerHost[];
  nowSec: number;
  renderCenterX: number;
  renderCenterY: number;
}) => {
  for (const layer of backgroundLayers) {
    layer.group.position.x = wrapCentered(
      renderCenterX * layer.parallax + nowSec * layer.driftX,
      layer.tileSize,
    );
    layer.group.position.y = wrapCentered(
      renderCenterY * layer.parallax + nowSec * layer.driftY,
      layer.tileSize,
    );
  }
};
