# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

postcss-ruler is a PostCSS plugin that generates fluid CSS scales and values using the `clamp()` function. It enables responsive typography and spacing by converting pixel-based min/max pairs into fluid CSS custom properties or inline values.

## Core Architecture

The plugin operates in three modes:

1. **Scale generation**: `@ruler scale()` - Generates multiple CSS custom properties from named pairs
2. **Utility class generation**: `@ruler utility()` - Generates utility classes from previously defined scales
3. **Inline mode**: `ruler.fluid(minSize, maxSize, minWidth?, maxWidth?)` - Converts inline function calls directly to `clamp()` values. The list form `ruler.fluid([16, 24, 28], [390, 1440, 2560]?)` goes through `calculateFluid` for any number of anchors

### Key Components

**Core maths** (`core.js`, exported as `postcss-ruler/core`):
- Pure functions with no PostCSS dependency, so the same maths can run in the browser or a Figma plugin
- `calculateClamp`: two-point `clamp(minRem, slopeVw + intersectRem, maxRem)`, all px converted to rem at a 16px base
- `calculateFluid({ values, anchors })`: one value per anchor width. 2 anchors delegate to `calculateClamp`. 3+ give `calc(base + clamp(0rem, (100vw - a)px * slope, Δrem) + …)`, one term per non-flat segment. The slope is rounded away from zero so each anchor lands exactly on its value
- `generateClamps`, `resolveScale`, and exporters `toCss`, `toTailwind4`, `toTailwind3`, `toRulerConfig`, which take the same shape as the plugin's `scales` option

**Main entry point** (`index.js`):
- Exports a PostCSS plugin factory function and requires the maths from `./core`
- Processes `@ruler` at-rules and inline `ruler.fluid()` in a `Once` hook, so it runs before plugins that rebuild the tree in their own `Once` (e.g. `@tailwindcss/postcss`, which lets `@ruler scale()` sit inside `@theme`). The `AtRule`/`Declaration` visitors stay for nodes added later (e.g. by postcss-import). In the `Once` pass, utilities whose scale isn't defined yet are left for the visitors
- Configuration: `minWidth` (default: 320), `maxWidth` (default: 1760), `anchors` (default anchors for list-form `ruler.fluid()` and for scales with no widths of their own whose size count matches), `generateAllCrossPairs` (default: false), `lowSpecificity`, `scales`

**At-rule processing** (`processFluidAtRule`, index.js:195):
- Parses `@ruler scale()` parameters using `postcss-value-parser`
- Accepts configuration: `minWidth`, `maxWidth`, `anchors`, `prefix`, `generateAllCrossPairs`, and `pairs`
- `pairs` values are collected per name until the next non-numeric key, so each token can have any number of values. The count must match the anchors
- Generates CSS custom properties in format: `--{prefix}-{label}: clamp(...)`
- When `generateAllCrossPairs: true`, creates additional cross-combinations between all defined pairs

**Utility class generation** (`processUtilityAtRule`, index.js:246):
- Parses `@ruler utility()` parameters using `postcss-value-parser`
- Accepts configuration: `selector`, `property`, `scale`, and `generateAllCrossPairs`
- References previously defined scales by their `prefix` name
- Generates CSS rules with selectors in format: `{selector}-{label}`
- Supports any valid CSS selector pattern including PostCSS nesting syntax with `&`
- Property can be a single value or array of properties
- Stores scales in memory during PostCSS processing for reference by utility at-rules

**Declaration processing** (`processFluidDeclaration`, index.js:367):
- Walks declaration values to find `ruler.fluid()` function calls
- Detects pattern: word "ruler", div ".", function "fluid"
- Replaces `ruler.fluid(...)` with calculated `clamp()` value in-place
- Removes "ruler" and "." tokens during replacement
- Note: The dot is parsed as a 'div' (divider) type node by postcss-value-parser

**Ruler studio** (`studio/`, not in the npm package):
- `studio/index.html` is a claude.ai artifact (https://claude.ai/artifact/QQjmqb3szidbWiqW8KYocM) for tuning multi-anchor scales, presenting them against today's stepped sizes, and exporting every core format
- It loads the repo's own `core.js` as a published file beside the page (`files: { "core.js": "core.js", "proposals.json": "studio/proposals.json" }`), so its numbers always match the plugin. Opened locally from a server at the repo root, it falls back to `../core.js`
- Saved proposals live in `proposals.json`; the page writes it with the `artifact` capability. Before republishing, read the live `proposals.json` back so saved proposals aren't overwritten
- Deep links: `#present`, and `#p-<proposal id>` opens a proposal in Present

## Development Commands

```bash
# Run unit tests
npm run unit

# Run tests and linting
npm test

# Run only linting
npx eslint .
```

## Testing

Tests use Node's built-in test runner (`node:test`). Test structure:
- Import plugin and PostCSS
- Use `run(input, output, opts)` helper function
- Verify CSS output and check for warnings

The test file (index.test.js) includes comprehensive tests for all plugin features including scale generation, utility class generation, inline functions, and various selector patterns.

## Plugin Usage Patterns

**Scale generation syntax**:
```css
@ruler scale({
  minWidth: 320,
  maxWidth: 1760,
  prefix: 'space',
  generateAllCrossPairs: false,
  pairs: {
    "xs": [8, 16],
    "sm": [16, 24],
    "md": [24, 32]
  }
});
/* Generates: --space-xs, --space-sm, --space-md custom properties */
```

**Utility class generation syntax**:
```css
/* Basic class selector */
@ruler utility({
  selector: '.gap',
  property: 'gap',
  scale: 'space'
});
/* Generates: .gap-xs, .gap-sm, .gap-md utility classes */

/* Nested selector with & */
@ruler utility({
  selector: '&.active',
  property: 'gap',
  scale: 'space'
});
/* Generates: &.active-xs, &.active-sm, &.active-md (for PostCSS nesting) */

/* Multiple classes */
@ruler utility({
  selector: '.container.space',
  property: 'padding',
  scale: 'space'
});
/* Generates: .container.space-xs, .container.space-sm, etc. */

/* ID selector */
@ruler utility({
  selector: '#section',
  property: 'margin',
  scale: 'space'
});
/* Generates: #section-xs, #section-sm, #section-md */

/* Parent context */
@ruler utility({
  selector: '.container &',
  property: 'gap',
  scale: 'space'
});
/* Generates: .container &-xs, .container &-sm, .container &-md */

/* Multiple properties */
@ruler utility({
  selector: '.p-block',
  property: ["padding-top", "padding-bottom"],
  scale: 'space'
});
/* Each utility class gets all specified properties */
```

**Inline function syntax**:
```css
.element {
  font-size: ruler.fluid(16, 24);           /* Uses default widths */
  padding: ruler.fluid(12, 20, 320, 1200); /* Custom widths */
}
```

## Important Implementation Details

- All calculations assume 16px base font size for rem conversion
- The plugin validates that min values are always less than max values
- Uses `postcss-value-parser` for parsing both at-rule params and declaration values
- Error messages are prefixed with `[postcss-ruler]`
- The `generateAllCrossPairs` feature creates combinations like `xs-md`, `xs-lg`, `sm-lg` from defined pairs. With 3+ anchors, a cross pair's value at anchor i is `lerp(smaller[i], larger[i], i / (n - 1))`
- Inline function detection looks for the pattern: word "ruler" + div "." + function "fluid"
- The dot separator is parsed as a 'div' type node by postcss-value-parser, not a 'word' node

### Utility Class Generation Details
- Scales must be defined with `@ruler scale()` before being referenced in `@ruler utility()`
- The `selector` parameter accepts any valid CSS selector pattern
- The plugin appends `-${label}` to the selector (e.g., `.gap` becomes `.gap-xs`, `.gap-sm`)
- Supports PostCSS nesting syntax - `&` characters are preserved in the output
- The `property` parameter can be a single string or an array of property names
- When `generateAllCrossPairs: false` is set on the utility, cross-pair classes are excluded even if the scale has them
- Scales are stored in memory during PostCSS processing and cleared after each run
