import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f17",
        panel: "#111827",
        accent: "#22d3ee",
        good: "#34d399",
        bad: "#f87171",
        warn: "#fbbf24",
      },
    },
  },
  plugins: [],
};

export default config;
