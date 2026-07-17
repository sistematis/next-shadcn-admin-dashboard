/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/default",
        permanent: false,
      },
    ];
  },
  // ponytail: same-origin proxy to iDempiere REST so the browser never hits CORS.
  // Client uses NEXT_PUBLIC_API_BASE_URL=/api/v1; Next rewrites to the real backend.
  async rewrites() {
    const dest = process.env.IDEMPIERE_API_URL || "https://erpzk.sistematis.id";
    return [{ source: "/api/v1/:path*", destination: `${dest}/api/v1/:path*` }];
  },
};

export default nextConfig;
