// Guilloche band: interlaced sine curves, the ornament of banknote security
// printing. A pure function of its options (no randomness), so the same band
// is written at every build and renders without JavaScript as inline SVG.
// Plain JS, no Astro imports, so node --test can run it.

const assertPositive = (name, value, min = 1) => {
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`guilloche ${name} must be a number >= ${min}, got ${value}`);
  }
};

const round = (n) => Math.round(n * 100) / 100;

// Each curve is the sum of two sine waves of different frequency whose phases
// move in opposite directions across the curves, so neighbours cross each
// other instead of running in parallel. The sum of amplitudes never exceeds
// half the height, which keeps every point inside the viewBox.
export function guillochePaths({
  width,
  height,
  curves,
  samples,
  waves = 3,
  ripples = 11,
  margin = 2,
}) {
  assertPositive("width", width);
  assertPositive("height", height);
  assertPositive("curves", curves);
  assertPositive("samples", samples, 2);

  const middle = height / 2;
  const reach = middle - margin;
  const slow = reach * 0.62;
  const fast = reach * 0.38;

  return Array.from({ length: curves }, (_, i) => {
    const phase = (i / curves) * Math.PI * 2;
    const points = Array.from({ length: samples + 1 }, (_, s) => {
      const t = s / samples;
      const angle = t * Math.PI * 2;
      const y =
        middle +
        slow * Math.sin(angle * waves + phase) +
        fast * Math.sin(angle * ripples - phase * 2);
      return [round(t * width), round(Math.min(height, Math.max(0, y)))];
    });
    return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  });
}
