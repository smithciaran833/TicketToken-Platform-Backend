import { logger } from '../config/logger';

interface RichMediaOptions {
  images?: Array<{
    url: string;
    alt?: string;
    width?: number;
    height?: number;
  }>;
  videos?: Array<{
    url: string;
    thumbnail?: string;
    duration?: number;
  }>;
  buttons?: Array<{
    text: string;
    url: string;
    style?: 'primary' | 'secondary' | 'danger';
  }>;
  cards?: Array<{
    title: string;
    description: string;
    image?: string;
    link?: string;
  }>;
}

export class RichMediaService {
  async processImages(images: RichMediaOptions['images']): Promise<any[]> {
    if (!images) return [];

    const processed: any[] = [];
    for (const image of images) {
      try {
        // In production, this would:
        // 1. Download image if needed
        // 2. Optimize for email (resize, compress)
        // 3. Upload to CDN
        // 4. Return optimized URL
        
        processed.push({
          ...image,
          optimizedUrl: image.url, // Would be CDN URL
          width: image.width || 600,
          height: image.height || 400,
        });
      } catch (error) {
        logger.error('Failed to process image', { url: image.url, error });
      }
    }

    return processed;
  }

  generateEmailHTML(options: RichMediaOptions): string {
    let html = '';

    // Add images
    if (options.images && options.images.length > 0) {
      html += '<div style="margin: 20px 0;">';
      for (const image of options.images) {
        html += `
          <img src="${image.url}" 
               alt="${image.alt || ''}" 
               style="max-width: 100%; height: auto; display: block; margin: 10px auto;"
               width="${image.width || 600}">
        `;
      }
      html += '</div>';
    }

    // Add buttons
    if (options.buttons && options.buttons.length > 0) {
      html += '<div style="margin: 20px 0; text-align: center;">';
      for (const button of options.buttons) {
        const bgColor = {
          primary: '#007bff',
          secondary: '#6c757d',
          danger: '#dc3545',
        }[button.style || 'primary'];

        html += `
          <a href="${button.url}" 
             style="display: inline-block; padding: 12px 24px; margin: 5px;
                    background-color: ${bgColor}; color: white; 
                    text-decoration: none; border-radius: 4px;">
            ${button.text}
          </a>
        `;
      }
      html += '</div>';
    }

    // Add cards
    if (options.cards && options.cards.length > 0) {
      html += '<div style="margin: 20px 0;">';
      for (const card of options.cards) {
        html += `
          <div style="border: 1px solid #ddd; border-radius: 8px; 
                      padding: 15px; margin: 10px 0;">
            ${card.image ? `<img src="${card.image}" style="max-width: 100%; margin-bottom: 10px;">` : ''}
            <h3 style="margin: 10px 0;">${card.title}</h3>
            <p style="margin: 10px 0;">${card.description}</p>
            ${card.link ? `<a href="${card.link}" style="color: #007bff;">Learn more →</a>` : ''}
          </div>
        `;
      }
      html += '</div>';
    }

    return html;
  }

  generateAMPEmail(options: RichMediaOptions): string {
    // Generate AMP-compatible email content
    let amp = `
      <!doctype html>
      <html ⚡4email>
      <head>
        <meta charset="utf-8">
        <script async src="https://cdn.ampproject.org/v0.js"></script>
        <style amp4email-boilerplate>body{visibility:hidden}</style>
      </head>
      <body>
    `;

    // Add AMP carousel for images
    if (options.images && options.images.length > 1) {
      amp += `
        <amp-carousel width="600" height="400" layout="responsive" type="slides">
          ${options.images.map(img => `
            <amp-img src="${img.url}" 
                     width="${img.width || 600}" 
                     height="${img.height || 400}" 
                     layout="responsive"
                     alt="${img.alt || ''}">
            </amp-img>
          `).join('')}
        </amp-carousel>
      `;
    }

    amp += '</body></html>';
    return amp;
  }
}

export const richMediaService = new RichMediaService();
