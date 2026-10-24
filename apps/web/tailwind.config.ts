import type { Config } from "tailwindcss";

// Centralized design tokens (Section 5/6 of the Phase 7B brief). Every
// component pulls color/spacing/radius from here - no hardcoded hex
// values or ad hoc pixel values scattered through components.
//
// - ink: deep navy/near-black, the primary color (text, chrome, primary actions)
// - paper: warm neutral, the secondary/background family - never pure white,
//   evokes physical legal paper rather than a generic SaaS canvas
// - saffron: a restrained amber/saffron accent, used sparingly (active
//   states, the one warm highlight) - deliberately not a "flag color"
//   treatment, just a quiet nod to Indian legal-document context
// - risk/review/safe/info: the semantic palette for risk severity and
//   evidence states, used consistently instead of ad hoc reds/greens
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f4f5f7",
          100: "#e5e7eb",
          200: "#cbd1db",
          300: "#9aa4b5",
          400: "#5a6680",
          500: "#4a5468",
          600: "#333c4d",
          700: "#252c3a",
          800: "#181d27",
          900: "#0f131b",
          950: "#090c11",
        },
        paper: {
          50: "#fdfcfa",
          100: "#faf7f2",
          200: "#f2ede3",
          300: "#e6ddcd",
          400: "#d3c5ac",
          500: "#b7a688",
        },
        saffron: {
          100: "#fbeed9",
          300: "#eec583",
          500: "#d99a3f",
          600: "#b97e2c",
          700: "#946222",
        },
        risk: {
          bg: "#fdf1f1",
          border: "#eec3c3",
          text: "#8a2222",
          strong: "#b42323",
        },
        review: {
          bg: "#fdf6e8",
          border: "#eed6a0",
          text: "#7a5a12",
          strong: "#96700f",
        },
        safe: {
          bg: "#f0f6f0",
          border: "#c3dcc4",
          text: "#2c5f30",
          strong: "#3a7a3f",
        },
        info: {
          bg: "#eff3fa",
          border: "#c3d3ec",
          text: "#274a80",
          strong: "#2f5aa0",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      fontSize: {
        display: ["2rem", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        "page-title": ["1.375rem", { lineHeight: "1.3", letterSpacing: "-0.005em" }],
        "section-title": ["0.9375rem", { lineHeight: "1.4", fontWeight: "600" }],
        "clause-title": ["0.8125rem", { lineHeight: "1.4", fontWeight: "600" }],
        meta: ["0.75rem", { lineHeight: "1.4" }],
        evidence: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.02em" }],
      },
      borderRadius: {
        xs: "3px",
        sm: "5px",
        DEFAULT: "7px",
        md: "9px",
        lg: "12px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(15, 19, 27, 0.06)",
        panel: "0 1px 3px rgba(15, 19, 27, 0.08), 0 1px 2px rgba(15, 19, 27, 0.04)",
        focus: "0 0 0 3px rgba(217, 154, 63, 0.35)",
      },
      spacing: {
        18: "4.5rem",
        13: "3.25rem",
      },
      animation: {
        "fade-in": "fadeIn 150ms ease-out",
        "flash-highlight": "flashHighlight 1600ms ease-out",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        flashHighlight: {
          "0%": { backgroundColor: "rgba(217, 154, 63, 0.55)" },
          "100%": { backgroundColor: "rgba(217, 154, 63, 0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
