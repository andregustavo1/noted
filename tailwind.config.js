/** @type {import('tailwindcss').Config} */
export default {
  // Dark theme follows the app's own setting (the `dark` class on <html>, see lib/settings.js), not the OS.
  darkMode: "class",
  // hover: only applies on devices that can hover, so taps don't leave sticky hover states.
  future: { hoverOnlyWhenSupported: true },
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'fade-in': { from: { opacity: '0' } },
        'pop-in': { from: { opacity: '0', transform: 'scale(0.96)' } },
        'fade-out': { to: { opacity: '0' } },
        'pop-out': { to: { opacity: '0', transform: 'scale(0.96)' } },
        'check-pop': { '0%': { transform: 'scale(0.7)' }, '55%': { transform: 'scale(1.15)' } },
        'check-draw': { from: { 'stroke-dashoffset': '24' } },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'pop-in': 'pop-in 200ms ease-out',
        'fade-out': 'fade-out 100ms ease-in forwards',
        'pop-out': 'pop-out 100ms ease-in forwards',
        'check-pop': 'check-pop 450ms cubic-bezier(0.23, 1, 0.32, 1)',
        'check-draw': 'check-draw 400ms 120ms ease-out backwards',
      },
      screens: {
        'ml': '425px',
      },
      colors: {
        primary: "#222",
        ...Object.fromEntries(
          ["light", "dark"].flatMap((t) =>
            ["text", "bg"].flatMap((k) =>
              ["primary", "secondary", "tertiary"].map((n) => [
                `${t}-${k}-color-${n}`,
                `var(--${t}-${k}-color-${n})`,
              ])
            )
          )
        ),
      },
    },
  },
  plugins: [],
}

