import path from "node:path"
import fs from "node:fs"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))


const projectRoot = (() => {
  try {
    return fs.realpathSync.native(__dirname)
  } catch {
    return __dirname
  }
})()

if (process.cwd() !== projectRoot) {
  try {
    process.chdir(projectRoot)
  } catch {}
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export',
  outputFileTracingRoot: projectRoot,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true, 
  },

  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false
    }

    return config
  },
}

export default nextConfig
