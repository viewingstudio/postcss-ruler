# postcss-ruler

A PostCSS plugin that generates fluid CSS scales and values using the `clamp()` function. Create responsive typography and spacing that scales smoothly between viewport sizes.

**Inspired by [Utopia](https://utopia.fyi/)**, but designed for real-world design collaboration. Instead of strict programmatic scales, postcss-ruler lets you define exact min and max pixel values for each size. This gives you the flexibility to match design specs from tools like Figma while still getting fluid scaling behavior.

## Why postcss-ruler?

Working with design teams often means dealing with sizes that don't follow perfect mathematical ratios. A designer might spec `16px → 24px` for one size and `32px → 56px` for another based on visual harmony rather than a type scale.

postcss-ruler embraces this reality. You get:

- **Fine-tuned control**: Set exact min and max values per size
- **Design tool compatibility**: Match your Figma specs precisely
- **Fluid behavior**: Smooth scaling between breakpoints via `clamp()`
- **Cross pairs**: Generate spacing between any two sizes (explained below)

## Installation

```bash
npm install postcss-ruler
```

## Usage

Add the plugin to your PostCSS configuration:

```javascript
// postcss.config.js
module.exports = {
  plugins: {
    "postcss-ruler": {
      minWidth: 320, // Default minimum viewport width
      maxWidth: 1760, // Default maximum viewport width
      generateAllCrossPairs: false,
      // Optional: Pre-define scales for cross-file usage (Astro, Vite, etc.)
      scales: {
        space: {
          pairs: {
            xs: [8, 16],
            sm: [16, 24],
            md: [24, 32],
          },
        },
      },
    },
  },
};
```

## Features

### 1. Scale Generation: Create Fluid Scales

Create multiple CSS custom properties from named size pairs:

```css
@ruler scale({
  minWidth: 320,
  maxWidth: 1760,
  prefix: 'space',
  generateAllCrossPairs: false,
  pairs: {
    "xs": [8, 16],
    "sm": [16, 24],
    "md": [24, 32],
    "lg": [32, 48],
    "xl": [48, 64]
  }
});
```

**Generates:**

```css
--space-xs: clamp(0.5rem, 0.4545vw + 0.3636rem, 1rem);
--space-sm: clamp(1rem, 0.4545vw + 0.8636rem, 1.5rem);
--space-md: clamp(1.5rem, 0.4545vw + 1.3636rem, 2rem);
--space-lg: clamp(2rem, 0.9091vw + 1.7273rem, 3rem);
--space-xl: clamp(3rem, 0.9091vw + 2.7273rem, 4rem);
```

### Understanding Cross Pairs

Cross pairs create fluid values between any two sizes in your scale. This is useful for spacing that needs to span multiple steps.

For example, if you have `xs: [8, 16]` and `lg: [32, 48]`, a cross pair `xs-lg` would scale from `8px → 48px`. This gives you a larger range of motion than using `xs` or `lg` alone.

**Without cross pairs**, you only get the sizes you explicitly define.

**With `generateAllCrossPairs: true`**, you get every possible combination:

```css
@ruler scale({
  prefix: 'space',
  generateAllCrossPairs: true,
  pairs: {
    "xs": [8, 16],
    "md": [24, 32],
    "lg": [32, 48]
  }
});
```

**Generates:**

```css
/* Your defined pairs */
--space-xs: clamp(0.5rem, ...);
--space-md: clamp(1.5rem, ...);
--space-lg: clamp(2rem, ...);

/* All cross combinations */
--space-xs-md: clamp(0.5rem, 1.3636vw + 0.3636rem, 2rem); /* 8px → 32px */
--space-xs-lg: clamp(0.5rem, 2.2727vw + 0.3636rem, 3rem); /* 8px → 48px */
--space-md-lg: clamp(1.5rem, 0.9091vw + 1.3636rem, 3rem); /* 24px → 48px */
```

**Use case**: Section padding that needs more dramatic scaling than your base sizes allow.

```css
.hero {
  padding-block: var(--space-md-xl); /* Scales across a wider range */
}
```

### Anchors: More Than Two Design Sizes

A pair only knows two sizes. If a design has a size for mobile, desktop, and large screens, give the scale `anchors` (viewport widths) and one size per anchor. Each value grows in a straight line between neighbouring anchors, so it can grow quickly from mobile to desktop and then slowly on big screens:

```css
@ruler scale({
  prefix: 'text',
  anchors: [375, 1440, 2560],
  pairs: {
    "md": [16, 18, 19],
    "lg": [24, 32, 36]
  }
});
```

**Generates:**

```css
--text-md: calc(
  1rem + clamp(0rem, (100vw - 375px) * 0.00188, 0.125rem) +
    clamp(0rem, (100vw - 1440px) * 0.0009, 0.0625rem)
);
--text-lg: calc(
  1.5rem + clamp(0rem, (100vw - 375px) * 0.00752, 0.5rem) +
    clamp(0rem, (100vw - 1440px) * 0.00358, 0.25rem)
);
```

Each value is its smallest size plus one `clamp()` per segment: "grow by up to this much between these two anchors". A term is zero before its segment and full after it, so the value is exactly the designed size at every anchor, with no media queries. Below the first anchor and above the last, it holds.

- Every token needs one value per anchor.
- Sizes can stay flat or shrink between anchors (e.g. `[16, 14, 14]`).
- Two anchors give exactly the same output as `minWidth`/`maxWidth`.
- With `generateAllCrossPairs: true`, a cross pair starts at the smaller token, ends at the larger one, and blends between the two at the anchors in between.

### 2. Utility Class Generation: Auto-Generate Utility Classes

Generate utility classes from your defined scales with complete selector flexibility:

```css
@ruler scale({
  prefix: 'space',
  pairs: {
    "xs": [8, 16],
    "sm": [16, 24],
    "md": [24, 32]
  }
});

/* Basic class selector */
@ruler utility({
  selector: '.gap',
  property: 'gap',
  scale: 'space'
});

/* Nested selector with & (for PostCSS nesting) */
@ruler utility({
  selector: '&.active',
  property: 'padding',
  scale: 'space'
});

/* Multiple properties */
@ruler utility({
  selector: '.p-block',
  property: ['padding-top', 'padding-bottom'],
  scale: 'space'
});
```

**Generates:**

```css
--space-xs: clamp(0.5rem, 0.5556vw + 0.3889rem, 1rem);
--space-sm: clamp(1rem, 0.5556vw + 0.8889rem, 1.5rem);
--space-md: clamp(1.5rem, 0.5556vw + 1.3889rem, 2rem);

.gap-xs {
  gap: clamp(0.5rem, 0.5556vw + 0.3889rem, 1rem);
}
.gap-sm {
  gap: clamp(1rem, 0.5556vw + 0.8889rem, 1.5rem);
}
.gap-md {
  gap: clamp(1.5rem, 0.5556vw + 1.3889rem, 2rem);
}

&.active-xs {
  padding: clamp(0.5rem, 0.5556vw + 0.3889rem, 1rem);
}
&.active-sm {
  padding: clamp(1rem, 0.5556vw + 0.8889rem, 1.5rem);
}
&.active-md {
  padding: clamp(1.5rem, 0.5556vw + 1.3889rem, 2rem);
}

.p-block-xs {
  padding-top: clamp(0.5rem, 0.5556vw + 0.3889rem, 1rem);
  padding-bottom: clamp(0.5rem, 0.5556vw + 0.3889rem, 1rem);
}
/* ... */
```

**Supported selector patterns:**

- **Class selectors**: `.gap` → `.gap-xs`, `.gap-sm`, `.gap-md`
- **Nested with &**: `&.active` → `&.active-xs`, `&.active-sm` (PostCSS nesting)
- **Multiple classes**: `.container.space` → `.container.space-xs`, etc.
- **ID selectors**: `#section` → `#section-xs`, `#section-sm`
- **Element selectors**: `section` → `section-xs`, `section-sm`
- **Parent context**: `.container &` → `.container &-xs`, etc.

**Utility options:**

| Option                  | Type            | Required | Description                                                           |
| ----------------------- | --------------- | -------- | --------------------------------------------------------------------- |
| `selector`              | string          | Yes      | Any valid CSS selector pattern (e.g., `.gap`, `&.active`, `#section`) |
| `property`              | string or array | Yes      | CSS property name(s) to apply the scale values to                     |
| `scale`                 | string          | Yes      | Name of a previously defined scale (the `prefix` value)               |
| `generateAllCrossPairs` | boolean         | No       | Include/exclude cross-pairs (overrides scale default)                 |

### 3. Inline Mode: Fluid Function

Convert individual values directly to `clamp()` functions:

```css
.element {
  /* Uses default minWidth/maxWidth from config */
  font-size: ruler.fluid(16, 24);

  /* Custom viewport widths */
  padding: ruler.fluid(12, 20, 320, 1200);

  /* Multiple fluid values */
  margin: ruler.fluid(8, 16) ruler.fluid(16, 32);
}
```

**Generates:**

```css
.element {
  font-size: clamp(1rem, 0.4545vw + 0.8636rem, 1.5rem);
  padding: clamp(0.75rem, 0.9091vw + 0.4773rem, 1.25rem);
  margin: clamp(0.5rem, 0.4545vw + 0.3636rem, 1rem)
    clamp(1rem, 0.9091vw + 0.7273rem, 2rem);
}
```

### 4. Low Specificity Mode: Zero-Specificity Utilities

Wrap generated selectors in `:where()` to reduce their specificity to 0, making them easier to override:

```css
@ruler scale({
  prefix: 'space',
  pairs: {
    "xs": [8, 16],
    "sm": [16, 24]
  }
});

/* Enable lowSpecificity per utility */
@ruler utility({
  selector: '.gap',
  property: 'gap',
  scale: 'space',
  lowSpecificity: true
});
```

**Generates:**

```css
--space-xs: clamp(0.5rem, 0.5556vw + 0.3889rem, 1rem);
--space-sm: clamp(1rem, 0.5556vw + 0.8889rem, 1.5rem);

:where(.gap-xs) {
  gap: clamp(0.5rem, 0.5556vw + 0.3889rem, 1rem);
}
:where(.gap-sm) {
  gap: clamp(1rem, 0.5556vw + 0.8889rem, 1.5rem);
}
```

**Specificity comparison:**

- `.gap-xs` → specificity (0,1,0)
- `:where(.gap-xs)` → specificity (0,0,0)

**Use case:** Design system utilities that should be easily overridable without `!important`:

```css
/* Utility with zero specificity */
:where(.gap-md) {
  gap: clamp(1.5rem, 0.5556vw + 1.3889rem, 2rem);
}

/* Easy to override with a simple class */
.custom-layout {
  gap: 2rem; /* This wins without !important */
}
```

**Works with attribute mode:**

```css
@ruler utility({
  attribute: 'data-size',
  property: 'font-size',
  scale: 'size',
  lowSpecificity: true
});
```

**Generates:**

```css
:where([data-size="xs"]) {
  font-size: var(--size-xs);
}
:where([data-size="sm"]) {
  font-size: var(--size-sm);
}
```

**Global configuration:**

```javascript
// postcss.config.js
module.exports = {
  plugins: {
    "postcss-ruler": {
      lowSpecificity: true, // All utilities use :where() by default
    },
  },
};
```

You can override the global setting per utility by explicitly setting `lowSpecificity: false`.

## Configuration Options

### Plugin Options

| Option                  | Type    | Default | Description                                                    |
| ----------------------- | ------- | ------- | -------------------------------------------------------------- |
| `minWidth`              | number  | `320`   | Default minimum viewport width in pixels                       |
| `maxWidth`              | number  | `1760`  | Default maximum viewport width in pixels                       |
| `generateAllCrossPairs` | boolean | `false` | Generate cross-combinations in scale mode                      |
| `lowSpecificity`        | boolean | `false` | Wrap utility selectors in `:where()` to lower specificity to 0 |
| `scales`                | object  | `{}`    | Pre-defined scales for cross-file usage (see below)            |

### Pre-defined Scales (for Astro, Vite, etc.)

When using bundlers like Astro or Vite that process CSS files in unpredictable order, you may encounter issues where `@ruler utility()` in one file can't reference a scale defined with `@ruler scale()` in another file.

To solve this, define your scales in the plugin config:

```javascript
// postcss.config.js
module.exports = {
  plugins: {
    "postcss-ruler": {
      scales: {
        space: {
          pairs: {
            xs: [8, 16],
            sm: [16, 24],
            md: [24, 32],
            lg: [32, 48],
          },
        },
        size: {
          minWidth: 400,
          maxWidth: 1200,
          generateAllCrossPairs: true,
          pairs: {
            sm: [100, 200],
            md: [200, 400],
          },
        },
      },
    },
  },
};
```

Now you can use `@ruler utility()` in any file without needing `@ruler scale()` first:

```css
/* Component.astro or any CSS file */
@ruler utility({
  selector: '.gap',
  property: 'gap',
  scale: 'space'
});
```

Config scales take `anchors` too, as widths or named objects. This is the same shape a design-token export can write, so a JSON file can be passed straight in with `scales: require("./tokens/type.json")`:

```javascript
scales: {
  text: {
    anchors: [
      { name: "Mobile", width: 390 },
      { name: "Desktop", width: 1024 },
      { name: "Display", width: 1920 },
    ],
    pairs: {
      "5xl": [48, 56, 72],
      md: [18, 18, 20],
    },
  },
}
```

**Note:** If you use `@ruler scale()` with the same prefix as a config-defined scale, the inline scale will override the config scale for that file.

### At-Rule Options

All options can be overridden per `@ruler scale()` declaration:

| Option                  | Type    | Default   | Description                                             |
| ----------------------- | ------- | --------- | ------------------------------------------------------- |
| `minWidth`              | number  | `320`     | Minimum viewport width for this scale                   |
| `maxWidth`              | number  | `1760`    | Maximum viewport width for this scale                   |
| `anchors`               | array   | —         | Viewport widths, one per value (replaces min/max width) |
| `prefix`                | string  | `"space"` | Prefix for generated CSS custom properties              |
| `generateAllCrossPairs` | boolean | `false`   | Generate cross-combinations for this scale              |
| `pairs`                 | object  | required  | `"name": [min, max]`, or one value per anchor           |

### Inline Function Syntax

```
ruler.fluid(minSize, maxSize[, minWidth, maxWidth])
```

| Parameter  | Type   | Required | Description                                  |
| ---------- | ------ | -------- | -------------------------------------------- |
| `minSize`  | number | Yes      | Minimum size in pixels                       |
| `maxSize`  | number | Yes      | Maximum size in pixels                       |
| `minWidth` | number | No       | Minimum viewport width (uses config default) |
| `maxWidth` | number | No       | Maximum viewport width (uses config default) |

### Static Values

When min and max values are equal, postcss-ruler outputs a simple rem value instead of a clamp() function. This works in all three modes:

**Inline function:**

```css
.element {
  font-size: ruler.fluid(20, 20);
}
```

**Generates:**

```css
.element {
  font-size: 1.25rem;
}
```

**Scale generation:**

```css
@ruler scale({
  prefix: 'size',
  pairs: {
    "static": [16, 16],
    "fluid": [16, 24]
  }
});
```

**Generates:**

```css
--size-static: 1rem;
--size-fluid: clamp(1rem, 0.5556vw + 0.8889rem, 1.5rem);
```

**Use case:** Mix static and fluid values in the same scale for consistency. Define your base unit as a static value and let other sizes scale fluidly from it.

### Utility Options

| Option                  | Type            | Default  | Description                                                                       |
| ----------------------- | --------------- | -------- | --------------------------------------------------------------------------------- |
| `selector`              | string          | required | Any valid CSS selector pattern (e.g., `.gap`, `&.active`, `#section`)             |
| `property`              | string or array | required | CSS property name(s) to apply the scale values to                                 |
| `scale`                 | string          | required | Name of a previously defined scale (the `prefix` value)                           |
| `generateAllCrossPairs` | boolean         | No       | Include/exclude cross-pairs (overrides scale default)                             |
| `lowSpecificity`        | boolean         | No       | Wrap selectors in `:where()` to reduce specificity to 0 (overrides global config) |

## How It Works

The plugin uses linear interpolation to create fluid values that scale smoothly between viewport sizes:

1. **Converts pixels to rem** (assumes 16px base font size)
2. **Calculates slope**: `(maxSize - minSize) / (maxWidth - minWidth)`
3. **Calculates y-intercept**: `-minWidth × slope + minSize`
4. **Generates clamp**: `clamp(minRem, slopeVw + intersectRem, maxRem)`

### Example Calculation

For `ruler.fluid(16, 24)` with default config (320-1760px):

- Slope: `(24 - 16) / (1760 - 320) = 0.005556`
- Intercept: `-320 × 0.005556 + 16 = 14.222`
- Result: `clamp(1rem, 0.5556vw + 0.8889rem, 1.5rem)`

At 320px viewport: `1rem` (16px)
At 1040px viewport: `1.3333rem` (≈21.3px)
At 1760px viewport: `1.5rem` (24px)

## Use Cases

### Utility-First Workflow with Fluid Scales

Generate a complete set of utility classes from your design system:

```css
@ruler scale({
  prefix: 'space',
  generateAllCrossPairs: true,
  pairs: {
    "xs": [8, 16],
    "sm": [12, 20],
    "md": [16, 28],
    "lg": [24, 40],
    "xl": [32, 56]
  }
});

/* Gap utilities */
@ruler utility({
  selector: '.gap',
  property: 'gap',
  scale: 'space'
});

/* Padding utilities */
@ruler utility({
  selector: '.p',
  property: 'padding',
  scale: 'space'
});

/* Margin utilities */
@ruler utility({
  selector: '.m',
  property: 'margin',
  scale: 'space'
});

/* Stack spacing (for flow layout) */
@ruler utility({
  selector: '.stack > * + *',
  property: 'margin-top',
  scale: 'space'
});
```

Use in your HTML:

```html
<section class="p-lg gap-md">
  <div class="stack gap-sm">
    <h2>Heading</h2>
    <p>Content that scales smoothly</p>
  </div>
</section>
```

### Responsive Typography

```css
@ruler scale({
  prefix: 'font',
  pairs: {
    "sm": [14, 16],
    "base": [16, 18],
    "lg": [18, 24],
    "xl": [24, 32],
    "2xl": [32, 48]
  }
});

body {
  font-size: var(--font-base);
}

h1 {
  font-size: var(--font-2xl);
}

h2 {
  font-size: var(--font-xl);
}
```

### Spacing System

```css
@ruler scale({
  prefix: 'space',
  generateAllCrossPairs: true,
  pairs: {
    "2xs": [4, 8],
    "xs": [8, 12],
    "sm": [12, 16],
    "md": [16, 24],
    "lg": [24, 32],
    "xl": [32, 48],
    "2xl": [48, 64]
  }
});

.section {
  padding-block: var(--space-lg);
  padding-inline: var(--space-md);
}

.stack > * + * {
  margin-top: var(--space-sm);
}
```

### One-Off Fluid Values

```css
.hero {
  font-size: ruler.fluid(32, 72);
  padding: ruler.fluid(24, 64);
}

.card {
  border-radius: ruler.fluid(8, 16);
  gap: ruler.fluid(12, 24);
}
```

## Tailwind CSS

### Tailwind v4

Put `@ruler scale()` inside `@theme`, with a prefix from Tailwind's theme namespaces (`text` for font sizes, `spacing` for spacing). Tailwind then generates utilities like `text-lg` from it:

```css
@import "tailwindcss";

@theme {
  @ruler scale({
    prefix: 'text',
    anchors: [375, 1440, 2560],
    pairs: {
      "md": [16, 18, 19],
      "lg": [24, 32, 36]
    }
  });
}
```

List `postcss-ruler` before `@tailwindcss/postcss` so the scale is expanded before Tailwind reads `@theme`:

```javascript
// postcss.config.js
module.exports = {
  plugins: {
    "postcss-ruler": {},
    "@tailwindcss/postcss": {},
  },
};
```

Tested with `@tailwindcss/postcss`. `@tailwindcss/vite` doesn't run through PostCSS, so it hasn't been tested.

### Tailwind v3 (or no build dependency)

Generate the tokens once with the core exporters, commit the output, and point the Tailwind theme at the custom properties:

```javascript
// scripts/build-tokens.js
const fs = require("fs");
const { toCss, toTailwind3 } = require("postcss-ruler/core");
const scales = require("../tokens/type.json");

fs.writeFileSync("src/styles/fluid-tokens.css", toCss(scales));
fs.writeFileSync("fluid-tokens.js", toTailwind3(scales));
```

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontSize: require("./fluid-tokens.js").text,
    },
  },
};
```

`text-lg` then sets `font-size: var(--text-lg)`. The string form sets font size only. If you need paired line heights, use Tailwind's `[size, { lineHeight }]` form.

## Using the Core Without PostCSS

`postcss-ruler/core` has the maths and exporters with no PostCSS dependency. It works in Node, the browser, or a Figma plugin.

| Function                                                   | Returns                                              |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| `calculateFluid({ values, anchors })`                      | A fluid value through each anchor                    |
| `calculateClamp({ minSize, maxSize, minWidth, maxWidth })` | A two-point `clamp()`                                |
| `toCss(scales, { selector })`                              | Custom properties, in `:root` by default             |
| `toTailwind4(scales)`                                      | An `@theme` block                                    |
| `toTailwind3(scales)`                                      | A theme module mapping names to `var(--prefix-name)` |
| `toRulerConfig(scales)`                                    | `@ruler scale()` at-rules                            |

`scales` is the same shape as the plugin's `scales` option.

## Browser Support

The `clamp()` function is supported in all modern browsers:

- Chrome 79+
- Firefox 75+
- Safari 13.1+
- Edge 79+

For older browsers, consider using a fallback:

```css
.element {
  font-size: 16px; /* Fallback */
  font-size: ruler.fluid(16, 24);
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
