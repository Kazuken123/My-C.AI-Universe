import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import { AIError, ValidationError } from '../ai/errors.js';
import { config } from '../config/index.js';

/**
 * WikiScraperService Class (OOP Service Layer)
 * Encapsulates Fandom/Wikipedia HTML scraping, infobox portrait extraction, and Gemini JSON lore parsing.
 */
export class WikiScraperService {
  constructor(allowedDomains = config.ALLOWED_DOMAINS, timeoutMs = config.WIKI_TIMEOUT) {
    this.allowedDomains = allowedDomains;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Validate URL and verify domain against security whitelist
   */
  validateUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new ValidationError('Invalid wiki URL provided', 'wiki');
    }

    let urlObj;
    try {
      urlObj = new URL(url.trim());
    } catch {
      throw new ValidationError('Malformed wiki URL', 'wiki');
    }

    // SSRF Defense 1: Enforce HTTP/HTTPS protocols only
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      throw new ValidationError(`Unsupported protocol: ${urlObj.protocol}. Only http: and https: are allowed.`, 'wiki');
    }

    const hostname = urlObj.hostname.toLowerCase();

    // SSRF Defense 2: Block loopback, cloud metadata, and local internal addresses
    const blockedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '169.254.169.254',
      'metadata.google.internal',
      'instance-data'
    ];
    if (
      blockedHosts.includes(hostname) ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      throw new ValidationError(`Access to private or local network address is forbidden: ${hostname}`, 'wiki');
    }

    // SSRF Defense 3: Strict domain matching (exact match or proper subdomain only)
    const isAllowed = this.allowedDomains.some(domain => {
      const d = domain.toLowerCase();
      return hostname === d || hostname.endsWith('.' + d);
    });

    if (!isAllowed) {
      throw new ValidationError(
        `Domain not allowed: ${urlObj.hostname}. Allowed domains: ${this.allowedDomains.join(', ')}`,
        'wiki'
      );
    }
    return urlObj;
  }

  /**
   * Build MediaWiki API URL for Fandom or Wikipedia articles to bypass Cloudflare bot challenges
   */
  buildMediaWikiApiUrl(urlObj) {
    const hostname = urlObj.hostname.toLowerCase();
    let pageTitle = '';
    if (urlObj.pathname.startsWith('/wiki/')) {
      pageTitle = decodeURIComponent(urlObj.pathname.slice(6));
    } else if (urlObj.searchParams.get('title')) {
      pageTitle = urlObj.searchParams.get('title');
    } else {
      pageTitle = decodeURIComponent(urlObj.pathname.replace(/^\//, ''));
    }
    pageTitle = pageTitle.split('#')[0].trim();
    if (!pageTitle) return null;

    if (hostname.endsWith('.wikipedia.org')) {
      return {
        apiUrl: `${urlObj.origin}/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&format=json&prop=text|images|displaytitle`,
        pageTitle: pageTitle.replace(/_/g, ' ')
      };
    }

    if (hostname.endsWith('.fandom.com') || hostname.endsWith('.wikia.com') || hostname.endsWith('.wikibooks.org')) {
      return {
        apiUrl: `${urlObj.origin}/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&format=json&prop=text|images|displaytitle`,
        pageTitle: pageTitle.replace(/_/g, ' ')
      };
    }

    return null;
  }

  /**
   * Fetch Wiki HTML either via MediaWiki API or direct browser-emulated HTTP GET
   */
  async fetchWikiHtml(url, urlObj, signal) {
    // 1. Try MediaWiki API first (completely bypasses Cloudflare on Fandom & Wikipedia)
    const mw = this.buildMediaWikiApiUrl(urlObj);
    if (mw) {
      try {
        console.log('[WIKI SERVICE] Querying MediaWiki API for canon lore:', mw.apiUrl);
        const apiRes = await fetch(mw.apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          },
          signal
        });
        if (apiRes.ok) {
          const apiJson = await apiRes.json();
          if (apiJson.parse && apiJson.parse.text && apiJson.parse.text['*']) {
            return {
              html: apiJson.parse.text['*'],
              title: apiJson.parse.title || mw.pageTitle,
              isApi: true
            };
          }
        }
      } catch (apiErr) {
        console.warn('[WIKI SERVICE] MediaWiki API notice, falling back to direct HTML fetch:', apiErr.message);
      }
    }

    // 2. Direct HTML fetch with realistic browser headers
    const directRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal
    });

    if (!directRes.ok) {
      throw new AIError(`Wiki fetch failed: HTTP ${directRes.status}`, 502);
    }

    const html = await directRes.text();
    return { html, title: '', isApi: false };
  }

  /**
   * Extract character portrait URL from Fandom / Wikipedia DOM
   */
  extractAvatar($, baseUrl) {
    const candidates = [
      $('figure.pi-item.pi-image img.pi-image-thumbnail').attr('data-src'),
      $('figure.pi-item.pi-image img.pi-image-thumbnail').attr('src'),
      $('figure.pi-item.pi-image img').first().attr('data-src'),
      $('figure.pi-item.pi-image img').first().attr('src'),
      $('.portable-infobox img').first().attr('data-src'),
      $('.portable-infobox img').first().attr('src'),
      $('.infobox img').first().attr('data-src'),
      $('.infobox img').first().attr('src'),
      $('table.infobox img').first().attr('src'),
      $('meta[property="og:image"]').attr('content'),
      $('meta[name="twitter:image"]').attr('content')
    ].filter(Boolean);

    for (let rawUrl of candidates) {
      if (rawUrl.startsWith('//')) {
        rawUrl = 'https:' + rawUrl;
      } else if (rawUrl.startsWith('/')) {
        try {
          const origin = new URL(baseUrl).origin;
          rawUrl = origin + rawUrl;
        } catch {
          continue;
        }
      }

      if (rawUrl.startsWith('http')) {
        // Strip downscale parameter if present on fandom wikis
        if (rawUrl.includes('/revision/latest/scale-to-width-down/')) {
          rawUrl = rawUrl.replace(/\/revision\/latest\/scale-to-width-down\/\d+/, '/revision/latest');
        }
        return rawUrl;
      }
    }
    return '';
  }

  /**
   * Extract fallback sections from DOM headings when AI quota is unavailable
   */
  extractSectionsFromDOM($) {
    const sections = {
      appearance: '',
      personality: '',
      abilities: '',
      background: ''
    };

    $('h2, h3').each((_, heading) => {
      const title = $(heading).text().toLowerCase();
      let text = '';
      let next = $(heading).next();
      while (next.length && !next.is('h2, h3') && text.length < 1200) {
        if (next.is('p')) {
          text += next.text().trim() + ' ';
        }
        next = next.next();
      }
      text = text.replace(/\[\d+\]/g, '').trim();
      if (!text) return;

      if (title.includes('appearance') || title.includes('ngoại hình')) {
        sections.appearance = sections.appearance || text;
      } else if (title.includes('personality') || title.includes('tính cách')) {
        sections.personality = sections.personality || text;
      } else if (title.includes('abilities') || title.includes('powers') || title.includes('năng lực')) {
        sections.abilities = sections.abilities || text;
      } else if (title.includes('background') || title.includes('history') || title.includes('synopsis')) {
        sections.background = sections.background || text;
      }
    });

    const firstParagraphs = $('#mw-content-text p, .mw-parser-output p')
      .slice(0, 4)
      .map((_, el) => $(el).text().replace(/\[\d+\]/g, '').trim())
      .get()
      .filter(Boolean)
      .join(' ');

    if (!sections.background && firstParagraphs) {
      sections.background = firstParagraphs.slice(0, 1000);
    }

    return sections;
  }

  /**
   * Scrape and parse a Fandom or Wikipedia character page
   */
  async parse(url) {
    const urlObj = this.validateUrl(url);
    console.log('[WIKI SERVICE] Processing wiki URL:', url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const { html, title: apiTitle } = await this.fetchWikiHtml(url, urlObj, controller.signal);
      clearTimeout(timeoutId);

      const $ = cheerio.load(html);

      const extractedAvatar = this.extractAvatar($, url);
      const pageTitle = (
        apiTitle ||
        $('h1#firstHeading').text() ||
        $('h1.page-header__title').text() ||
        $('title').text().split('|')[0].split('-')[0] ||
        decodeURIComponent(urlObj.pathname.split('/').pop() || '').replace(/_/g, ' ') ||
        'Canon Character'
      ).trim();

      const domFallback = this.extractSectionsFromDOM($);

      $('script, style, nav, footer, .navbox, .catlinks, .wds-global-navigation, .wds-community-header, .page-header__bottom, .page-footer, .reference').remove();

      const contentText = $('#mw-content-text, .mw-parser-output, main, article')
        .find('h1, h2, h3, h4, p, li')
        .text()
        .replace(/\s+/g, ' ')
        .trim();

      const wikiText = contentText.slice(0, 40000);
      if (!wikiText || wikiText.length < 50) {
        throw new ValidationError('Insufficient content extracted from wiki page', 'wiki');
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const prompt = `You are extracting comprehensive character information from a wiki article for a Character.AI roleplay character.

From the text below, extract the following fields into STRICT JSON:
- name: Character's full name
- tagline: Short catchy roleplay subtitle (under 70 chars)
- greeting: An engaging opening roleplay message in light-novel format (*italic action* on line 1, Name: "Dialogue" on line 2)
- appearance: Physical description and attire
- personality: Character traits, behavior, and psychological profile
- abilities: Special powers, skills, and capabilities
- background: History, origin story, and significant life events
- speaking_style: How the character speaks (tone, mannerisms, catchphrases)
- initial_memory: 3-5 key canonical memories or facts (format as a clear string with bullet points or newlines)
- categories: Array of 2-3 category tags from ["Anime", "Roleplay", "Action", "Fantasy", "Helper", "Mystery", "Slice of Life", "Game"]

Text:
${wikiText}`;

          const geminiResponse = await ai.models.generateContent({
            model: config.GEMINI_MODEL,
            contents: prompt,
            config: { responseMimeType: 'application/json' }
          });

          const rawText = (geminiResponse.text || '')
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '');

          const extractedData = JSON.parse(rawText);

          // Handle array initial_memory formatting
          if (Array.isArray(extractedData.initial_memory)) {
            extractedData.initial_memory = extractedData.initial_memory.join('\n');
          }

          const fields = [
            'name', 'tagline', 'greeting', 'appearance', 'personality',
            'abilities', 'background', 'speaking_style', 'initial_memory'
          ];
          for (const f of fields) {
            if (typeof extractedData[f] !== 'string') {
              extractedData[f] = domFallback[f] || '';
            }
          }
          if (!extractedData.name && pageTitle) extractedData.name = pageTitle;
          if (!Array.isArray(extractedData.categories) || extractedData.categories.length === 0) {
            extractedData.categories = ['Anime', 'Roleplay'];
          }
          if (extractedAvatar) {
            extractedData.avatar = extractedAvatar;
          } else if (typeof extractedData.avatar !== 'string') {
            extractedData.avatar = '';
          }
          extractedData.wikiUrl = url;
          return extractedData;
        } catch (aiErr) {
          console.warn('[WIKI SERVICE] Gemini extraction notice, fallback to DOM parser:', aiErr.message);
        }
      }

      return {
        name: pageTitle,
        tagline: 'Imported from Canon Lore',
        greeting: `*Steps forward calmly and acknowledges your presence.* Greetings, I am ${pageTitle}.`,
        appearance: domFallback.appearance || 'Described in canonical archives.',
        personality: domFallback.personality || 'Fierce, honorable, and true to character.',
        abilities: domFallback.abilities || 'Mastery of canonical skills and signature techniques.',
        background: domFallback.background || 'Extracted from canonical wiki records.',
        speaking_style: 'Direct, expressive, and canonical.',
        initial_memory: domFallback.background ? domFallback.background.slice(0, 300) : '',
        categories: ['Anime', 'Roleplay'],
        avatar: extractedAvatar,
        wikiUrl: url
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ValidationError) throw error;
      if (error.name === 'AbortError') {
        throw new AIError('Wiki parsing request timed out', 504);
      }
      throw error;
    }
  }
}

export const wikiScraperService = new WikiScraperService();

export async function parseWiki(url) {
  return wikiScraperService.parse(url);
}
