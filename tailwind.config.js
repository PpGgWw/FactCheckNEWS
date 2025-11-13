/** @type {import('tailwindcss').Config} */
const colors = require('./color/theme.js');

module.exports = {
  content: [
    "./content_script.js",
    "./components/*.js",
    "./panel/*.html",
    "./panel/*.jsx"
  ],
  theme: {
    extend: {
      colors: {
        ...colors
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'medium': '0 4px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 30px -5px rgba(0, 0, 0, 0.05)',
        'strong': '0 10px 40px -10px rgba(0, 0, 0, 0.15), 0 20px 60px -15px rgba(0, 0, 0, 0.1)',
        'glow': '0 0 20px rgba(242, 206, 162, 0.3)',
      },
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-left': 'slideLeft 0.3s ease-out',
        'slide-right': 'slideRight 0.3s ease-out',
        'bounce-soft': 'bounceSoft 0.6s ease-out',
        'pulse-soft': 'pulseSoft 2s infinite',
        'spin-slow': 'spin 1.5s linear infinite',
        'shimmer': 'shimmer 2s infinite linear',
        'glow': 'glow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideRight: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        bounceSoft: {
          '0%, 20%, 53%, 80%, 100%': { transform: 'translate3d(0,0,0)' },
          '40%, 43%': { transform: 'translate3d(0,-15px,0)' },
          '70%': { transform: 'translate3d(0,-7px,0)' },
          '90%': { transform: 'translate3d(0,-2px,0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(242, 206, 162, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(242, 206, 162, 0.6)' },
        }
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '200ms',
        'slow': '300ms',
      }
    },
  },
  plugins: [],
  safelist: [
    // Main theme colors
    'bg-background', 'bg-background-dark', 'bg-background-card',
    'bg-primary', 'bg-primary-dark', 'bg-primary-light',
    'bg-secondary', 'bg-secondary-dark', 'bg-secondary-light',
    'bg-surface', 'bg-surface-hover', 'bg-surface-active',
    
    // Text colors
    'text-text-primary', 'text-text-secondary', 'text-text-muted',
    
    // Border colors
    'border-border', 'border-border-light', 'border-border-dark',
    'border-secondary', 'border-primary',

    // Status Colors
    'bg-status-success', 'bg-status-success-light', 'bg-status-success-dark',
    'border-status-success', 'border-status-success-dark',
    'text-status-success', 'text-status-success-dark',
    
    'bg-status-error', 'bg-status-error-light', 'bg-status-error-dark',
    'border-status-error', 'border-status-error-dark',
    'text-status-error', 'text-status-error-dark',
    
    'bg-status-warning', 'bg-status-warning-light', 'bg-status-warning-dark',
    'border-status-warning', 'border-status-warning-dark',
    'text-status-warning', 'text-status-warning-dark',
    
    'bg-status-info', 'bg-status-info-light', 'bg-status-info-dark',
    'border-status-info', 'border-status-info-dark',
    'text-status-info', 'text-status-info-dark',

    // Interactive colors
    'bg-accent', 'bg-accent-light', 'bg-accent-dark',
    'text-accent', 'text-accent-dark', 'border-accent',

    // Hover states
    'hover:bg-surface-hover', 'hover:bg-primary-light', 'hover:bg-secondary-light',
    'hover:text-text-primary', 'hover:border-primary', 'hover:shadow-soft',
    
    // Animation classes
    'animate-fade-in', 'animate-slide-up', 'animate-slide-down', 'animate-slide-left', 'animate-slide-right',
    'animate-bounce-soft', 'animate-pulse-soft', 'animate-spin-slow', 'animate-shimmer', 'animate-glow',
    
    // Shadow classes
    'shadow-soft', 'shadow-medium', 'shadow-strong', 'shadow-glow',
    
    // Transition durations
    'duration-fast', 'duration-normal', 'duration-slow',
    
    // Gradient utilities
    'bg-gradient-primary', 'bg-gradient-subtle', 'bg-gradient-panel-header', 'bg-gradient-panel-surface',
    'bg-gradient-panel-alt', 'bg-gradient-panel-dark', 'bg-gradient-panel-base',
    
    // Pattern and backdrop utilities
    'pattern-dots', 'backdrop-blur-panel', 'backdrop-blur-modal',
    
    // Utility classes
    'hover:shadow-glow', 'hover:animate-glow',
  ],
}
