import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

const proxyTarget = (process.env.VITE_PROXY_TARGET || "http://127.0.0.1:3001").replace(/\/+$/, "");
const appName = (process.env.VITE_APP_NAME || "OptiX Maintenance Pro").trim();
const appShortName = (process.env.VITE_APP_SHORT_NAME || "OptiX Maint - Pro").trim();
const appCompany = (process.env.VITE_APP_COMPANY || "TamOptiX Technologies").trim();
const appTagline = (process.env.VITE_APP_TAGLINE || `Powered by ${appCompany}`).trim();

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    strictPort: false,
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: proxyTarget.replace(/^http/, "ws"),
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "tamoptix/tamoptix-favicon.png",
        "tamoptix/tamoptix-favicon.svg",
        "tamoptix/tamoptix-logo.png",
        "tamoptix/favicon-16x16.png",
        "tamoptix/favicon-32x32.png",
        "tamoptix/favicon.ico",
        "tamoptix/apple-touch-icon.png",
        "tamoptix/maskable-icon.png",
        "offline.html",
      ],
      manifest: {
        name: appName,
        short_name: appShortName,
        description: appTagline,
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0f172a",
        orientation: "any",
        icons: [
          { src: "/tamoptix/tamoptix-logo.png", sizes: "72x72", type: "image/png", purpose: "any" },
          { src: "/tamoptix/tamoptix-logo.png", sizes: "96x96", type: "image/png", purpose: "any" },
          { src: "/tamoptix/tamoptix-logo.png", sizes: "128x128", type: "image/png", purpose: "any" },
          { src: "/tamoptix/tamoptix-logo.png", sizes: "144x144", type: "image/png", purpose: "any" },
          { src: "/tamoptix/tamoptix-logo.png", sizes: "152x152", type: "image/png", purpose: "any" },
          { src: "/tamoptix/tamoptix-logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/tamoptix/tamoptix-logo.png", sizes: "384x384", type: "image/png", purpose: "any" },
          { src: "/tamoptix/tamoptix-logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/tamoptix/tamoptix-logo.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/tamoptix/tamoptix-logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ],
        categories: ["business", "productivity", "utilities"],
        shortcuts: [
          {
            name: "Dashboard",
            short_name: "Dashboard",
            url: "/",
            icons: [{ src: "/tamoptix/tamoptix-logo.png", sizes: "192x192", type: "image/png" }]
          },
          {
            name: "Work Orders",
            short_name: "Work Orders",
            url: "/work-orders",
            icons: [{ src: "/tamoptix/tamoptix-logo.png", sizes: "192x192", type: "image/png" }]
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "app-shell-pages",
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: ({ request, url }) =>
              request.destination === "image" || url.pathname.startsWith("/tamoptix/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "app-branding-images",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/branding/logo"),
            handler: "NetworkFirst",
            options: {
              cacheName: "branding-logo-assets",
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/branding/manifest"),
            handler: "NetworkFirst",
            options: {
              cacheName: "branding-manifests",
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === "POST" &&
              (url.pathname.startsWith("/api/work-orders") ||
                url.pathname.startsWith("/api/pm-schedules") ||
                url.pathname.startsWith("/api/calibration") ||
                url.pathname.startsWith("/api/amc")),
            handler: "NetworkOnly",
            options: {
              backgroundSync: {
                name: "cmms-background-updates",
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-radix": [
            "@radix-ui/react-accordion",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-label",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-select",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
          ],
          "vendor-icons": ["lucide-react"],
          "vendor-charts": ["recharts"],
          "vendor-xlsx": ["exceljs"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
