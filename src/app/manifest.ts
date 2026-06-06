import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'QBike',
    short_name: 'QBike',
    description: 'College Bike Booking System',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#1B3392',
    icons: [
      {
        src: '/images/logo/qbike-192x192.webp',
        sizes: '192x192',
        type: 'image/webp',
      },
      {
        src: '/images/logo/qbike-512x512.webp',
        sizes: '512x512',
        type: 'image/webp',
      },
    ],
  };
}
