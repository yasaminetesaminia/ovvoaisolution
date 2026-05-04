import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Lavora brand — warm gold + deep slate. "where science, beauty,
        // and longevity meet" should *feel* premium, not Bootstrap-blue.
        brand: {
          50: "#FAF7F2",
          100: "#F2EBDF",
          200: "#E5D6BC",
          300: "#D2B98D",
          400: "#BF9C5E",
          500: "#A98143",
          600: "#8E6936",
          700: "#73522B",
          800: "#5A4023",
          900: "#3D2C18",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Cormorant Garamond", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
