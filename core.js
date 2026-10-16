/**
 * Pure fluid-scale maths and exporters. No PostCSS dependency, so this file
 * can run in the browser, a Figma plugin, or a plain Node script.
 */

const ROOT_FONT_SIZE = 16;

/**
 * Converts pixels to rem units
 * @param {number} px - Pixel value to convert
 * @returns {string} Rem value as string
 */
const pxToRem = (px) => `${parseFloat((px / ROOT_FONT_SIZE).toFixed(4))}rem`;

/**
 * Validates that min value is less than max value
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} context - Context for error message
 * @throws {Error} If min >= max
 */
const validateMinMax = (min, max, context) => {
  if (min >= max) {
    throw new Error(
      `[postcss-ruler] Invalid ${context}: min (${min}) must be less than max (${max})`,
    );
  }
};

/**
 * Normalises anchors given as widths or { name, width } objects
 * @param {Array<number|{name?: string, width: number}>} anchors - Anchor viewports
 * @returns {Array<{name: string, width: number}>} Normalised anchors
 * @throws {Error} If there are fewer than two anchors or widths don't increase
 */
const normalizeAnchors = (anchors) => {
  if (!Array.isArray(anchors) || anchors.length < 2) {
    throw new Error("[postcss-ruler] anchors needs at least two widths");
  }

  const normalized = anchors.map((anchor) =>
    typeof anchor === "number"
      ? { name: `${anchor}px`, width: anchor }
      : {
          name: anchor.name || `${anchor.width}px`,
          width: Number(anchor.width),
        },
  );

  normalized.forEach(({ width }, i) => {
    if (!Number.isFinite(width) || width <= 0) {
      throw new Error(`[postcss-ruler] Invalid anchor width: ${width}`);
    }
    if (i > 0 && width <= normalized[i - 1].width) {
      throw new Error(
        `[postcss-ruler] anchors must increase: ${normalized[i - 1].width} then ${width}`,
      );
    }
  });

  return normalized;
};

/**
 * Calculates a fluid clamp() function between two viewport widths
 * @param {Object} params - Calculation parameters
 * @param {number} params.minSize - Minimum size in pixels
 * @param {number} params.maxSize - Maximum size in pixels
 * @param {number} params.minWidth - Minimum viewport width in pixels
 * @param {number} params.maxWidth - Maximum viewport width in pixels
 * @returns {string} CSS clamp() function
 */
const calculateClamp = ({ minSize, maxSize, minWidth, maxWidth }) => {
  // Allow equal values - just return rem
  if (minSize === maxSize) {
    return pxToRem(minSize);
  }

  validateMinMax(minSize, maxSize, "size");
  validateMinMax(minWidth, maxWidth, "width");

  const slope = (maxSize - minSize) / (maxWidth - minWidth);
  const intersect = -minWidth * slope + minSize;

  return `clamp(${pxToRem(minSize)}, ${(slope * 100).toFixed(
    4,
  )}vw + ${pxToRem(intersect)}, ${pxToRem(maxSize)})`;
};

/**
 * Calculates a fluid value that passes through a size at each anchor width.
 * Two anchors give the same clamp() as calculateClamp. Three or more give
 * calc(base + one clamp() per segment), where each segment term is zero
 * before its segment and its full growth after it.
 * @param {Object} params - Calculation parameters
 * @param {number[]} params.values - Size in pixels at each anchor
 * @param {Array<number|{width: number}>} params.anchors - Anchor viewports
 * @returns {string} CSS value
 */
const calculateFluid = ({ values, anchors }) => {
  const widths = normalizeAnchors(anchors).map(({ width }) => width);

  if (values.length !== widths.length) {
    throw new Error(
      `[postcss-ruler] Expected ${widths.length} values (one per anchor), got ${values.length}`,
    );
  }

  if (widths.length === 2) {
    return calculateClamp({
      minSize: values[0],
      maxSize: values[1],
      minWidth: widths[0],
      maxWidth: widths[1],
    });
  }

  const terms = [];
  for (let i = 0; i < widths.length - 1; i++) {
    const delta = values[i + 1] - values[i];
    if (delta === 0) continue;

    // Round the slope away from zero so each term reaches its cap by the
    // next anchor, keeping every anchor exactly on its designed size
    const slope =
      (Math.sign(delta) *
        Math.ceil((Math.abs(delta) / (widths[i + 1] - widths[i])) * 1e5)) /
      1e5;
    const low = pxToRem(Math.min(0, delta));
    const high = pxToRem(Math.max(0, delta));
    terms.push(`clamp(${low}, (100vw - ${widths[i]}px) * ${slope}, ${high})`);
  }

  const base = pxToRem(values[0]);
  return terms.length ? `calc(${base} + ${terms.join(" + ")})` : base;
};

/**
 * Generates fluid values from named size lists
 * @param {Object} params - Generation parameters
 * @param {Array<{name: string, values: number[]}>} params.pairs - Sizes per anchor
 * @param {Array<number|{width: number}>} params.anchors - Anchor viewports
 * @param {boolean} params.generateAllCrossPairs - Whether to generate cross pairs
 * @returns {Array<{label: string, clamp: string, cross?: boolean}>} Array of fluid values, cross pairs marked `cross: true`
 */
const generateClamps = ({ pairs, anchors, generateAllCrossPairs }) => {
  const count = anchors.length;

  pairs.forEach(({ name, values }) => {
    if (values.length !== count) {
      throw new Error(
        `[postcss-ruler] "${name}" has ${values.length} values but the scale has ${count} anchors`,
      );
    }
  });

  let clampScales = pairs.map(({ name, values }) => ({
    label: name,
    clamp: calculateFluid({ values, anchors }),
  }));

  if (generateAllCrossPairs) {
    let crossPairs = [];
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const [smaller, larger] = [pairs[i], pairs[j]].sort(
          (a, b) => a.values[0] - b.values[0],
        );
        // Starts at the smaller token, ends at the larger one, and blends
        // between them at each anchor in between
        const values = smaller.values.map(
          (value, k) => value + (larger.values[k] - value) * (k / (count - 1)),
        );
        crossPairs.push({
          label: `${smaller.name}-${larger.name}`,
          clamp: calculateFluid({ values, anchors }),
          cross: true,
        });
      }
    }
    clampScales = [...clampScales, ...crossPairs];
  }

  return clampScales;
};

/**
 * Resolves a scale config (the plugin's `scales` option shape) into anchors,
 * pairs, and flags
 * @param {Object} scaleConfig - { anchors?, minWidth?, maxWidth?, pairs, generateAllCrossPairs? }
 * @param {Object} [defaults] - Fallback anchors, minWidth, maxWidth, generateAllCrossPairs
 * @returns {{anchors: Array<{name: string, width: number}>, pairs: Array<{name: string, values: number[]}>, generateAllCrossPairs: boolean}}
 */
const resolveScale = (scaleConfig, defaults = {}) => {
  const pairs = Object.entries(scaleConfig.pairs || {}).map(
    ([name, values]) => ({ name, values }),
  );

  // Default anchors apply when the scale sets no widths of its own and its
  // sizes match them in count, so two-value scales keep minWidth/maxWidth
  const useDefaultAnchors =
    !scaleConfig.minWidth &&
    !scaleConfig.maxWidth &&
    pairs.length > 0 &&
    defaults.anchors?.length === pairs[0].values.length;

  const anchors = normalizeAnchors(
    scaleConfig.anchors ||
      (useDefaultAnchors
        ? defaults.anchors
        : [
            scaleConfig.minWidth || defaults.minWidth || 320,
            scaleConfig.maxWidth || defaults.maxWidth || 1760,
          ]),
  );

  return {
    anchors,
    pairs,
    generateAllCrossPairs:
      scaleConfig.generateAllCrossPairs ??
      defaults.generateAllCrossPairs ??
      false,
  };
};

/**
 * Builds the values for every scale in a scales map
 * @param {Object} scales - { [prefix]: scaleConfig }
 * @returns {Array<{prefix: string, anchors: Array, items: Array<{label: string, clamp: string}>}>}
 */
const buildScales = (scales) =>
  Object.entries(scales).map(([prefix, scaleConfig]) => {
    const resolved = resolveScale(scaleConfig);
    return {
      prefix,
      anchors: resolved.anchors,
      items: generateClamps(resolved),
    };
  });

const describeAnchors = (prefix, anchors) =>
  `/* ${prefix}: ${anchors
    .map(({ name, width }) =>
      name === `${width}px` ? name : `${name} ${width}px`,
    )
    .join(" → ")}. 16px root. */`;

/**
 * Exports scales as CSS custom properties
 * @param {Object} scales - { [prefix]: scaleConfig }
 * @param {Object} [options] - { selector: ':root' }
 * @returns {string} CSS
 */
const toCss = (scales, { selector = ":root" } = {}) => {
  const lines = buildScales(scales).flatMap(({ prefix, anchors, items }) => [
    `  ${describeAnchors(prefix, anchors)}`,
    ...items.map(({ label, clamp }) => `  --${prefix}-${label}: ${clamp};`),
  ]);
  return `${selector} {\n${lines.join("\n")}\n}\n`;
};

/**
 * Exports scales as a Tailwind v4 @theme block
 * @param {Object} scales - { [prefix]: scaleConfig }
 * @returns {string} CSS
 */
const toTailwind4 = (scales) => toCss(scales, { selector: "@theme" });

/**
 * Exports scales as a Tailwind v3 theme module that points at the custom
 * properties from toCss(), e.g. theme.extend.fontSize = require(...).text
 * @param {Object} scales - { [prefix]: scaleConfig }
 * @returns {string} CommonJS module source
 */
const toTailwind3 = (scales) => {
  const theme = {};
  buildScales(scales).forEach(({ prefix, items }) => {
    theme[prefix] = {};
    items.forEach(({ label }) => {
      theme[prefix][label] = `var(--${prefix}-${label})`;
    });
  });
  return `// Generated by postcss-ruler. Needs the custom properties from toCss().\nmodule.exports = ${JSON.stringify(
    theme,
    null,
    2,
  )};\n`;
};

/**
 * Exports scales as @ruler scale() at-rules
 * @param {Object} scales - { [prefix]: scaleConfig }
 * @returns {string} CSS
 */
const toRulerConfig = (scales) =>
  Object.entries(scales)
    .map(([prefix, scaleConfig]) => {
      const { anchors, pairs, generateAllCrossPairs } =
        resolveScale(scaleConfig);
      const lines = [
        `  prefix: '${prefix}',`,
        `  anchors: [${anchors.map(({ width }) => width).join(", ")}],`,
      ];
      if (generateAllCrossPairs) lines.push("  generateAllCrossPairs: true,");
      lines.push(
        "  pairs: {",
        ...pairs.map(
          ({ name, values }) => `    "${name}": [${values.join(", ")}],`,
        ),
        "  }",
      );
      return `@ruler scale({\n${lines.join("\n")}\n});\n`;
    })
    .join("\n");

module.exports = {
  pxToRem,
  validateMinMax,
  normalizeAnchors,
  calculateClamp,
  calculateFluid,
  generateClamps,
  resolveScale,
  toCss,
  toTailwind3,
  toTailwind4,
  toRulerConfig,
};
