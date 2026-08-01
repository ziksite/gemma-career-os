/** @type {import('next').NextConfig} */
const nextConfig = {
  // google-auth-library memakai dynamic require; biarkan Node yang memuatnya,
  // jangan di-bundle oleh Turbopack/webpack.
  serverExternalPackages: ['google-auth-library'],
};

export default nextConfig;
