/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f4f7f6",
          100: "#e3ebe8",
          200: "#c5d6d0",
          300: "#9bb8ae",
          400: "#6f9487",
          500: "#52786c",
          600: "#3f6057",
          700: "#344e47",
          800: "#2c403b",
          900: "#263632",
          950: "#131d1b",
        },
        accent: {
          DEFAULT: "#c45c26",
          soft: "#e8a87c",
          deep: "#8f3f12",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Helvetica", "Arial", "sans-serif"],
      },
      backgroundImage: {
        paper:
          "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(196,92,38,0.08), transparent 50%), radial-gradient(ellipse 70% 50% at 90% 10%, rgba(82,120,108,0.12), transparent 45%), linear-gradient(165deg, #f7f4ef 0%, #eef3f1 40%, #e8eeeb 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.95)", opacity: "0.6" },
          "70%": { transform: "scale(1.05)", opacity: "0" },
          "100%": { transform: "scale(0.95)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.55s ease-out both",
        "pulse-ring": "pulse-ring 1.8s ease-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [],
};

module.exports = config;
