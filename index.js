const CSSValueParser = require("postcss-value-parser");
const {
  calculateClamp,
  calculateFluid,
  generateClamps,
  normalizeAnchors,
  resolveScale,
} = require("./core");

/**
 * @type {import('postcss').PluginCreator}
 */
module.exports = (opts) => {
  const DEFAULTS = {
    minWidth: 320,
    maxWidth: 1760,
    generateAllCrossPairs: false,
    lowSpecificity: false,
    scales: {},
  };
  const config = Object.assign(DEFAULTS, opts);

  // Storage for generated scales
  const scales = {};

  /**
   * Pre-processes scales defined in plugin config
   * @param {Object} configScales - Scales object from plugin options
   */
  const initializeConfigScales = (configScales) => {
    Object.entries(configScales).forEach(([prefix, scaleConfig]) => {
      scales[prefix] = generateClamps(resolveScale(scaleConfig, config));
    });
  };

  // Initialize scales from config (if any)
  if (Object.keys(config.scales).length > 0) {
    initializeConfigScales(config.scales);
  }

  /**
   * Parses parameters from @fluid at-rule
   * @param {Array} params - Parsed parameter nodes
   * @returns {Object} Parsed configuration object
   */
  const parseAtRuleParams = (params) => {
    const clampsParams = {
      minWidth: config.minWidth,
      maxWidth: config.maxWidth,
      pairs: {},
      prefix: "space",
      generateAllCrossPairs: config.generateAllCrossPairs,
    };

    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      const nextParam = params[i + 1];
      if (!param || !nextParam) continue;
      const key = param.value;
      let value = nextParam.value.replace(/[:,]/g, "");

      switch (key) {
        case "minWidth":
        case "maxWidth":
          clampsParams[key] = Number(value);
          clampsParams.ownWidths = true;
          i++;
          break;
        case "prefix":
          clampsParams.prefix = value.replace(/['"]/g, "");
          i++;
          break;
        case "generateAllCrossPairs":
          clampsParams.generateAllCrossPairs = value === "true";
          i++;
          break;
        case "anchors": {
          // Collect widths until the closing bracket, e.g. [375 | 1440 | 2560]
          const anchors = [];
          while (++i < params.length) {
            const width = Number(params[i].value.replace(/[[\],]/g, ""));
            if (params[i].value.replace(/[[\],]/g, "") !== "") {
              anchors.push(width);
            }
            if (params[i].value.includes("]")) break;
          }
          clampsParams.anchors = anchors;
          break;
        }
      }
    }

    return clampsParams;
  };

  /**
   * Extracts pairs from parsed parameters
   * @param {Array} params - Parsed parameter nodes
   * @returns {Object} Pairs object with name: [size at each anchor] entries
   */
  const extractPairs = (params) => {
    const pairs = {};
    const pairsStartIndex = params.findIndex((x) => x.value === "pairs");

    if (pairsStartIndex === -1) return pairs;

    let currentName = null;

    for (let i = pairsStartIndex + 1; i < params.length; i++) {
      const param = params[i];

      if (param.type === "string") {
        currentName = param.value;
        pairs[currentName] = [];
        continue;
      }

      const value = param.value.replace(/[[\]{},]/g, "");
      if (value === "") continue;

      // A non-numeric word is the next key (e.g. prefix), so pairs have ended
      const numValue = Number(value);
      if (isNaN(numValue)) break;

      if (currentName) pairs[currentName].push(numValue);
    }

    return pairs;
  };

  /**
   * Parses parameters from @ruler utility() at-rule
   * @param {Array} params - Parsed parameter nodes
   * @returns {Object} Parsed configuration object
   */
  const parseUtilityParams = (params) => {
    const utilityParams = {
      selector: null,
      property: null,
      scale: null,
      generateAllCrossPairs: null,
      attribute: null,
      lowSpecificity: null,
    };

    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      const nextParam = params[i + 1];
      if (!param || !nextParam) continue;
      const key = param.value;
      let value = nextParam.value.replace(/[:,]/g, "");

      switch (key) {
        case "selector":
        case "scale":
        case "attribute":
          utilityParams[key] = value.replace(/['"]/g, "");
          i++;
          break;
        case "property":
          // Check if it's an array (next token is '[')
          if (nextParam.value === "[") {
            // It's an array - collect values until we hit ']'
            const arrayValues = [];
            i += 2; // Skip 'property' and '['
            while (i < params.length && params[i].value !== "]") {
              if (params[i].type === "string") {
                arrayValues.push(params[i].value);
              }
              i++;
            }
            utilityParams.property = arrayValues;
          } else {
            // Single value
            utilityParams.property = value.replace(/['"]/g, "");
            i++;
          }
          break;
        case "generateAllCrossPairs":
          utilityParams.generateAllCrossPairs = value === "true";
          i++;
          break;
        case "lowSpecificity":
          utilityParams.lowSpecificity = value === "true";
          i++;
          break;
      }
    }

    return utilityParams;
  };

  /**
   * Processes @fluid at-rule and generates CSS custom properties
   * @param {Object} atRule - PostCSS at-rule node
   */
  const processFluidAtRule = (atRule) => {
    const { nodes } = CSSValueParser(atRule.params);
    const params = nodes[0].nodes.filter(
      (x) =>
        ["word", "string"].includes(x.type) &&
        x.value !== "{" &&
        x.value !== "}",
    );

    const clampsParams = parseAtRuleParams(params);
    clampsParams.pairs = extractPairs(params);

    if (Object.keys(clampsParams.pairs).length === 0) {
      throw new Error("[postcss-ruler] No pairs defined in @ruler scale()");
    }

    const clampPairs = Object.entries(clampsParams.pairs).map(
      ([name, values]) => ({ name, values }),
    );
    const clampScale = generateClamps({
      pairs: clampPairs,
      anchors: normalizeAnchors(
        clampsParams.anchors ||
          (!clampsParams.ownWidths &&
          config.anchors?.length === clampPairs[0].values.length
            ? config.anchors
            : [clampsParams.minWidth, clampsParams.maxWidth]),
      ),
      generateAllCrossPairs: clampsParams.generateAllCrossPairs,
    });

    // Store the scale for later use by utility classes
    scales[clampsParams.prefix] = clampScale;

    const postcss = require("postcss");
    const root = postcss.root();

    clampScale.forEach((step) => {
      root.append(
        postcss.decl({
          prop: `--${clampsParams.prefix}-${step.label}`,
          value: step.clamp,
        }),
      );
    });

    atRule.replaceWith(root.nodes);
  };

  /**
   * Processes @ruler utility() at-rule and generates utility classes
   * @param {Object} atRule - PostCSS at-rule node
   * @param {boolean} [deferMissingScale] - Leave the at-rule for a later pass
   *   instead of throwing when its scale isn't defined yet
   */
  const processUtilityAtRule = (atRule, deferMissingScale = false) => {
    const postcss = require("postcss");
    const { nodes } = CSSValueParser(atRule.params);
    const params = nodes[0].nodes.filter(
      (x) =>
        ["word", "string", "function"].includes(x.type) &&
        x.value !== "{" &&
        x.value !== "}",
    );

    const utilityParams = parseUtilityParams(params);

    // Resolve lowSpecificity from config if not explicitly set
    if (utilityParams.lowSpecificity === null) {
      utilityParams.lowSpecificity = config.lowSpecificity;
    }

    // Validate attribute-specific constraints first
    if (utilityParams.attribute !== null) {
      if (utilityParams.attribute === "") {
        throw new Error(
          "[postcss-ruler] @ruler utility() attribute parameter cannot be empty",
        );
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(utilityParams.attribute)) {
        throw new Error(
          "[postcss-ruler] @ruler utility() attribute parameter must contain only letters, numbers, hyphens, and underscores",
        );
      }
    }

    // Validate required parameters
    if (!utilityParams.selector && !utilityParams.attribute) {
      throw new Error(
        '[postcss-ruler] @ruler utility() requires either "selector" or "attribute" parameter',
      );
    }
    if (!utilityParams.property) {
      throw new Error(
        '[postcss-ruler] @ruler utility() requires a "property" parameter',
      );
    }
    if (!utilityParams.scale) {
      throw new Error(
        '[postcss-ruler] @ruler utility() requires a "scale" parameter',
      );
    }

    // Check if scale exists
    const scale = scales[utilityParams.scale];
    if (!scale && deferMissingScale) return;
    if (!scale) {
      throw new Error(
        `[postcss-ruler] Scale "${utilityParams.scale}" not found. Define it with @ruler scale() first.`,
      );
    }

    // Determine which scale items to use
    let scaleItems = scale;
    if (utilityParams.generateAllCrossPairs === false) {
      // Filter out cross-pairs. Names can contain hyphens (e.g. "2xl-sans"),
      // so check the flag rather than the label
      scaleItems = scale.filter((item) => !item.cross);
    }

    // Normalize property to array
    const properties = Array.isArray(utilityParams.property)
      ? utilityParams.property
      : [utilityParams.property];

    // Generate utility classes as PostCSS nodes
    const rules = scaleItems.map((item) => {
      let ruleSelector;
      let ruleValue;

      if (utilityParams.attribute) {
        // Attribute mode: [data-attr="value"] or .class[data-attr="value"]
        const attrSelector = `[${utilityParams.attribute}="${item.label}"]`;
        const baseSelector = utilityParams.selector
          ? `${utilityParams.selector}${attrSelector}`
          : attrSelector;
        ruleSelector = utilityParams.lowSpecificity
          ? `:where(${baseSelector})`
          : baseSelector;
        ruleValue = `var(--${utilityParams.scale}-${item.label})`;
      } else {
        // Class mode (existing behavior)
        const baseSelector = `${utilityParams.selector}-${item.label}`;

        // Handle parent context selectors (e.g., ".container &")
        if (utilityParams.lowSpecificity) {
          if (utilityParams.selector.endsWith(" &")) {
            // Parent context: ".container &" -> ".container :where(&-xs)"
            const parentPart = utilityParams.selector.slice(0, -1); // Remove trailing "&"
            ruleSelector = `${parentPart}:where(&-${item.label})`;
          } else {
            // Regular selector: wrap entire selector
            ruleSelector = `:where(${baseSelector})`;
          }
        } else {
          ruleSelector = baseSelector;
        }

        ruleValue = item.clamp;
      }

      const rule = postcss.rule({ selector: ruleSelector });

      properties.forEach((prop) => {
        rule.append(postcss.decl({ prop, value: ruleValue }));
      });

      return rule;
    });

    atRule.replaceWith(rules);
  };

  /**
   * Turns the array form of ruler.fluid() into a fluid value
   * @param {string} args - e.g. "[16, 24, 28], [390, 1440, 2560]"
   * @returns {string} CSS value
   */
  const parseFluidArrays = (args) => {
    const lists = [...args.matchAll(/\[([^\]]*)\]/g)].map(([, list]) =>
      list
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number),
    );
    const [values, anchors] = lists;

    if (
      !values ||
      values.length < 2 ||
      values.some((v) => !Number.isFinite(v))
    ) {
      throw new Error(
        `[postcss-ruler] ruler.fluid() needs at least two sizes: ruler.fluid(${args})`,
      );
    }

    return calculateFluid({
      values,
      anchors: anchors || defaultAnchors(values.length),
    });
  };

  /**
   * Anchors used when ruler.fluid() or a scale doesn't give its own
   * @param {number} count - How many values need an anchor
   * @returns {number[]} Anchor widths
   */
  const defaultAnchors = (count) => {
    if (config.anchors && config.anchors.length === count) {
      return config.anchors;
    }
    if (count === 2) return [config.minWidth, config.maxWidth];
    throw new Error(
      `[postcss-ruler] ruler.fluid() got ${count} sizes but no anchors. Pass them as a second list, or set the plugin's anchors option with ${count} widths`,
    );
  };

  /**
   * Processes inline fluid functions in declarations
   * @param {Object} decl - PostCSS declaration node
   */
  const processFluidDeclaration = (decl) => {
    const regex = /ruler\.fluid\(([^)]+)\)/g;
    let newValue = decl.value;
    let match;

    while ((match = regex.exec(decl.value)) !== null) {
      // Array form: ruler.fluid([16, 24, 28], [390, 1440, 2560])
      if (match[1].includes("[")) {
        newValue = newValue.replace(match[0], parseFluidArrays(match[1]));
        continue;
      }

      const args = match[1]
        .split(",")
        .map((s) => s.trim())
        .map(Number);
      let [minSize, maxSize, minWidth, maxWidth] = args;

      minWidth = minWidth || config.minWidth;
      maxWidth = maxWidth || config.maxWidth;

      if (!minSize || !maxSize) {
        throw new Error(
          "[postcss-ruler] ruler.fluid() requires minSize and maxSize",
        );
      }

      const clampValue = calculateClamp({
        minSize,
        maxSize,
        minWidth,
        maxWidth,
      });

      newValue = newValue.replace(match[0], clampValue);
    }

    if (newValue !== decl.value) {
      decl.value = newValue;
    }
  };

  /**
   * Routes an @ruler at-rule to its processor
   * @param {Object} atRule - PostCSS at-rule node
   * @param {boolean} [deferMissingScale] - See processUtilityAtRule
   */
  const processRulerAtRule = (atRule, deferMissingScale = false) => {
    if (atRule.params.startsWith("scale(")) {
      return processFluidAtRule(atRule);
    } else if (atRule.params.startsWith("utility(")) {
      return processUtilityAtRule(atRule, deferMissingScale);
    }
  };

  return {
    postcssPlugin: "ruler",
    // Runs before plugins that rebuild the tree in their own Once hook, such
    // as @tailwindcss/postcss, so @ruler works inside @theme. Anything added
    // later (e.g. by postcss-import) is handled by the visitors below.
    Once(root) {
      root.walkAtRules("ruler", (atRule) => processRulerAtRule(atRule, true));
      root.walkDecls(processFluidDeclaration);
    },
    AtRule: {
      ruler: (atRule) => processRulerAtRule(atRule),
    },
    Declaration(decl) {
      processFluidDeclaration(decl);
    },
  };
};

module.exports.postcss = true;
