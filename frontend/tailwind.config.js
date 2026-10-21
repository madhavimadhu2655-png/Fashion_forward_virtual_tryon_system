/** @type {import('tailwindcss').Config} */

// Every colour is a CSS variable defined in src/index.css (design tokens),
// so the palette lives in one place and supports Tailwind opacity modifiers.
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', "ui-serif", "Georgia", "serif"],
        sans: ['"Manrope"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      colors: {
        ivory: token("ivory"),
        porcelain: token("porcelain"),
        canvas: token("canvas"),
        sand: token("sand"),
        line: token("line"),
        ink: { DEFAULT: token("ink"), soft: token("ink-soft") },
        stone: { DEFAULT: token("stone"), light: token("stone-light") },
        wine: { DEFAULT: token("wine"), deep: token("wine-deep"), soft: token("wine-soft") },
        blush: token("blush"),
        sage: { DEFAULT: token("sage"), soft: token("sage-soft") },
        amber: { DEFAULT: token("amber"), soft: token("amber-soft") },
        danger: { DEFAULT: token("danger"), soft: token("danger-soft") },

        // Legacy names from the previous theme, remapped onto the new
        // palette so any untouched class still renders on-brand.
        paper: token("ivory"),
        violet: { DEFAULT: token("wine"), deep: token("wine-deep"), soft: token("wine-soft") },
        rani: { DEFAULT: token("wine"), deep: token("wine-deep"), soft: token("wine-soft") },
        mint: { DEFAULT: token("sage"), deep: token("sage"), soft: token("sage-soft") },
        saffron: { DEFAULT: token("amber"), soft: token("amber-soft") },
        sky: { DEFAULT: token("canvas"), deep: token("ink-soft"), soft: token("canvas") },
        gray: {
          50: "#FAF7F2",
          100: "#F2ECE4",
          200: "#E6DED3",
          300: "#D2C7BA",
          400: "#A89C91",
          500: "#7E736B",
          600: "#62584F",
          700: "#4A423C",
          800: "#2F2925",
          900: "#1E1A18",
        },
        rose: {
          50: "#FBF0EE",
          100: "#F6E1DD",
          200: "#EBC4BD",
          500: "#B0453C",
          600: "#A1352F",
          700: "#842A25",
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
        control: "var(--radius-control)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        lift: "var(--shadow-lift)",
      },
      maxWidth: {
        page: "80rem",
      },
      letterSpacing: {
        eyebrow: "0.18em",
      },
    },
  },
  plugins: [],
};
