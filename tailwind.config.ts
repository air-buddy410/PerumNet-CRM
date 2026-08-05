import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#effaf8",
          100: "#d5f2ee",
          200: "#abe4de",
          300: "#79d0c9",
          400: "#43b5ae",
          500: "#1fb2a6",
          600: "#16847e",
          700: "#156a66",
          800: "#155553",
          900: "#164745",
          950: "#062a2a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
