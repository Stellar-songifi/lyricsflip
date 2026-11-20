/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.stories.{js,ts,jsx,tsx}",
    "./.storybook/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class", 
  theme: {
    extend: {
      fontFamily: {
        interv: ['var(--font-interv)'],
        sans: ['var(--font-geist-sans)'],
        mono: ['var(--font-geist-mono)'],
      },
      backgroundColor: {
        background: 'var(--background)',
      },
      textColor: {
        foreground: 'var(--foreground)',
      },
      borderColor: {
        DEFAULT: 'var(--border)',
      },
      colors: {
        textdark: 'var(--color-textdark)',
        gray: 'var(--color-gray)',
        darkgeist: 'var(--color-darkgeist)',
        purplePrimary: {
          1: 'var(--color-purplePrimary1)',
          2: 'var(--color-purplePrimary2)',
          3: 'var(--color-purplePrimary3)',
          4: 'var(--color-purplePrimary4)',
          5: 'var(--color-purplePrimary5)',
        },
        whiteSecondary: {
          1: 'var(--color-whiteSecondary1)',
          2: 'var(--color-whiteSecondary2)',
        },
        tealPrimary: {
          1: 'var(--color-tealPrimary1)',
          2: 'var(--color-tealPrimary2)',
          3: 'var(--color-tealPrimary3)',
          4: 'var(--color-tealPrimary4)',
        },
        background: {
          1: 'var(--color-background1)',
          2: 'var(--color-background2)',
          3: 'var(--color-background3)',
        },
      },
      spacing: {
        md: 'var(--spacing-md)',
        lg: 'var(--spacing-lg)',
        xl: 'var(--spacing-xl)',
        '2xl': 'var(--spacing-2xl)',
        '7xl': 'var(--spacing-7xl)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
