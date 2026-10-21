import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    server: {
        host: true, // needed so it's reachable from outside the Docker container
        port: 5173,
    },
});
