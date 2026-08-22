import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        status: {
          suspended: {
            DEFAULT: "#EF4444",
            light: "#FEE2E2",
            dark: "#7F1D1D",
            border: "#DC2626",
          },
          partial: {
            DEFAULT: "#F59E0B",
            light: "#FEF3C7",
            dark: "#78350F",
            border: "#D97706",
          },
          continue: {
            DEFAULT: "#10B981",
            light: "#D1FAE5",
            dark: "#064E3B",
            border: "#059669",
          },
          unknown: {
            DEFAULT: "#6B7280",
            light: "#F3F4F6",
            dark: "#374151",
            border: "#4B5563",
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        heading: ["var(--font-outfit)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
