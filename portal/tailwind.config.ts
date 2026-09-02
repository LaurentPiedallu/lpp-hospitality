import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // LPP Design System, status colors only, never decorative.
        // The portal palette is dark / cream / gold / action-red (see
        // DESIGN.md). "healthy" green below is a named exception: it is
        // allowed ONLY on the "complete" status dot / check glyph, never
        // for decoration or category color coding.
        status: {
          healthy: "#16a34a",   // green-600, "complete" status indicator only
          monitor: "#d97706",   // amber-600
          critical: "#dc2626",  // red-600
          reference: "#2563eb", // blue-600
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
