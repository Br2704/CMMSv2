import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

const proxyTarget = (process.env.VITE_PROXY_TARGET || "http://127.0.0.1:3001").replace(/\/+$/, "");

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
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: [
        "jkfenner/jkfenner-favicon.ico",
        "jkfenner/jkfenner-favicon.svg",
        "jkfenner/jkfenner-logo.png",
        "tamoptix/tamoptix-logo.png",
        "tamoptix/tamoptix-logo.svg",
      ],
      manifest: {
        name: "JK Fenner CMMS",
        short_name: "JK Fenner CMMS",
        description: "JK Fenner CMMS Platform",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0f172a",
        orientation: "any",
        icons: [
          {
            src: "/jkfenner/jkfenner-favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "/jkfenner/jkfenner-logo.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/jkfenner/jkfenner-logo.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          }
        ],
        categories: ["business", "productivity", "utilities"],
        shortcuts: [
          {
            name: "Dashboard",
            short_name: "Dashboard",
            url: "/",
            icons: [{ src: "/jkfenner/jkfenner-favicon.svg", sizes: "any" }]
          },
          {
            name: "Work Orders",
            short_name: "Work Orders",
            url: "/work-orders",
            icons: [{ src: "/jkfenner/jkfenner-favicon.svg", sizes: "any" }]
          }
        ]
      },
      injectManifest: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
