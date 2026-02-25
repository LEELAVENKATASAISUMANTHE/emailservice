/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    VITE_API_URL: process.env.VITE_API_URL
  }
};

export default nextConfig;
