import type { NeutronStarVisualTuning } from "@3body/shared";

export const NEUTRON_STAR_JET_SECONDARY_LENGTH_FACTOR = 0.86;
export const NEUTRON_STAR_JET_SECONDARY_OPACITY_FACTOR = 0.84;
export const NEUTRON_STAR_JET_SECONDARY_WIDTH_FACTOR = 0.74;
export const NEUTRON_STAR_LENGTH_MASS_SCALE = 2.4;
export const NEUTRON_STAR_LENS_MASS_SCALE = 1.1;
export const NEUTRON_STAR_HALO_MASS_SCALE = 0.9;
export const NEUTRON_STAR_WIDTH_MASS_SCALE = 0.12;

export const getNeutronStarVisualShape = ({
  haloPulse,
  massAlpha,
  pulse,
  radius,
  tuning,
}: {
  haloPulse: number;
  massAlpha: number;
  pulse: number;
  radius: number;
  tuning: NeutronStarVisualTuning;
}) => ({
  coreRadius: radius * pulse,
  haloRadius:
    radius * (tuning.haloScale + massAlpha * NEUTRON_STAR_HALO_MASS_SCALE) * haloPulse,
  jetLength:
    radius *
    (tuning.jetLengthScale + massAlpha * NEUTRON_STAR_LENGTH_MASS_SCALE),
  jetWidth:
    radius * (tuning.jetWidthScale + massAlpha * NEUTRON_STAR_WIDTH_MASS_SCALE),
  lensRadius:
    radius * (tuning.lensScale + massAlpha * NEUTRON_STAR_LENS_MASS_SCALE),
});
