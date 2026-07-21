/** @type {import('next').NextConfig} */
const backendOrigin =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ||
  "";

const nextConfig = {
  // output: 'export',
  // basePath: '/motabhai_front',
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    if (!backendOrigin) return [];

    return [
      {
        source: "/backend-api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
