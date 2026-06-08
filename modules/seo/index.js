const { pages } = require('../../packages/config/routes');

function createSeoModule({ baseUrl = 'https://attoflow.com.br' } = {}) {
  return {
    pages,
    metadata(path) {
      const page = pages.find((item) => item.path === path) || pages.find((item) => item.path.replace(/\[.*?\]/g, 'demo') === path);
      const fallback = pages.find((item) => item.path === '/');
      const selected = page || fallback;
      return {
        ...selected,
        canonical: `${baseUrl}${path}`,
        openGraph: {
          title: selected.title,
          description: selected.description,
          type: selected.type === 'public' ? 'website' : 'software.application',
          url: `${baseUrl}${path}`,
        },
        schema: this.schemaFor(path),
      };
    },
    sitemap() {
      const urls = pages
        .filter((page) => page.type === 'public' && !page.path.includes('['))
        .map((page) => `<url><loc>${baseUrl}${page.path}</loc><changefreq>weekly</changefreq><priority>${page.path === '/' ? '1.0' : '0.7'}</priority></url>`)
        .join('');
      return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
    },
    robots() {
      return ['User-agent: *', 'Allow: /', 'Disallow: /app', `Sitemap: ${baseUrl}/sitemap.xml`].join('\n');
    },
    schemaFor(path) {
      if (path === '/') {
        return {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'ATTO FLOW',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          description: 'CRM, WhatsApp, automação, campanhas e IA para equipes comerciais.',
        };
      }
      if (path.startsWith('/blog')) return { '@context': 'https://schema.org', '@type': 'Article', headline: 'ATTO FLOW Blog' };
      const page = pages.find((item) => item.path === path) || pages.find((item) => item.path === '/');
      return { '@context': 'https://schema.org', '@type': 'WebPage', name: page.title, description: page.description };
    },
  };
}

module.exports = { createSeoModule };
