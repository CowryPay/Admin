import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cowry: {
          // Brand chrome — same hexes as cowrypay-frontend's tailwind config.
          green:  "#00D437", // primary accent: nav, buttons, focus rings
          dark:   "#0B0B0B", // page plane
          darker: "#070707",
          card:   "#141414", // card / chart surface
          border: "#242424",
          muted:  "#888888",
        },
        // Chart ink, stepped for the #141414 chart surface. Kept separate from
        // the brand chrome above because they answer to different rules: these
        // are validated against the surface, brand green is not (see `series`).
        chart: {
          grid:     "#2c2c2a",
          axis:     "#383835",
          label:    "#898781",
          ink:      "#ffffff",
          inkMuted: "#c3c2b7",
        },
        // Categorical series slots, in fixed order — never cycled, never
        // reassigned by rank. Validated as a set against the #141414 chart
        // surface (lightness band, chroma floor, all-pairs CVD separation,
        // normal-vision floor, 3:1 contrast).
        //
        // Brand green #00D437 is deliberately NOT a series color: at OKLCH
        // L 0.756 it sits above the 0.48–0.67 dark-mode band, so it reads as a
        // glare against dark cards. It stays on chrome (where it's a UI accent,
        // not a data mark) and `series.1` carries the same green identity at a
        // step that passes.
        series: {
          1: "#199e70", // green  — primary measure (sends, sent volume, fees)
          2: "#d95926", // orange — secondary measure (deposits, deposited volume)
          3: "#9085e9", // violet — tertiary
        },
        // Reserved meanings — never reused as a series color. Always paired
        // with an icon or label so state is never carried by hue alone.
        status: {
          good:     "#0ca30c",
          warning:  "#fab219",
          serious:  "#ec835a",
          critical: "#d03b3b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      backgroundImage: {
        "glow-green": "radial-gradient(ellipse at 50% 0%, rgba(0,212,55,0.10) 0%, transparent 60%)",
      },
    },
  },
  plugins: [],
};

export default config;
