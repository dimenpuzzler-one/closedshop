import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  // This is a closed mall; private products must not enter a public sitemap.
  return [];
}
