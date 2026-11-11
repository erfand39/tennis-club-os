/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    }, {
      source: '/:path((?!_next/static/).*)',
      headers: [{key:'Cache-Control',value:'private, no-store'}],
    }];
  },
};

export default config;
