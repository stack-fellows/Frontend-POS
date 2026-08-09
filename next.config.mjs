/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export only in production builds (for Electron file:// loading)
  // Dev mode loads from localhost:3000 directly, which doesn't support export mode
  ...(process.env.NODE_ENV === 'production' ? {
    output: 'export',
    assetPrefix: './',
  } : {}),
  images: {
    unoptimized: true,
  },
  transpilePackages: ['lucide-react'],
};

export default nextConfig;
