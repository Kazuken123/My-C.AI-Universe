import * as cheerio from 'cheerio';
import { GoogleGenAI } from '@google/genai';
import { AIError, ValidationError } from '../ai/errors.js';
import { config } from '../config/index.js';

/**
 * Extract character portrait URL from Fandom / Wikipedia DOM
 */
function extractWikiAvatar($, baseUrl) {
  const candidates = [
    $('figure.pi-item.pi-image img.pi-image-thumbnail').attr('src'),
    $('.portable-infobox img').first().attr('src'),
    $('.infobox img').first().attr('src'),
    $('meta[property="og:image"]').attr('content')
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
      return rawUrl;
    }
  }
  return '';
}

/**
 * Fallback heuristic extraction from DOM headings if AI quota is unavailable
 */
function extractSectionsFromDOM($) {
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
 * Parse wiki page and extract comprehensive character information
 * @param {string} url - Wiki URL to parse
 * @returns {Promise<Object>} Extracted character data
 */
export async function parseWiki(url) {
  if (!url || typeof url !== 'string') {
    throw new ValidationError('Invalid wiki URL provided', 'wiki');
  }

  let urlObj;
  try {
    urlObj = new URL(url.trim());
  } catch {
    throw new ValidationError('Malformed wiki URL', 'wiki');
  }

  const isAllowed = config.ALLOWED_DOMAINS.some(domain =>
    urlObj.hostname.includes(domain)
  );

  if (!isAllowed) {
    throw new ValidationError(
      `Domain not allowed: ${urlObj.hostname}. Allowed: ${config.ALLOWED_DOMAINS.join(', ')}`,
      'wiki'
    );
  }

  console.log('[WIKI] Fetching wiki URL:', url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.WIKI_TIMEOUT);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyCAIUniverse/2.0)'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new AIError(`Wiki fetch failed: HTTP ${response.status}`, 502);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const extractedAvatar = extractWikiAvatar($, url);
    const pageTitle = (
      $('h1#firstHeading').text() ||
      $('h1.page-header__title').text() ||
      $('title').text().split('|')[0].split('-')[0] ||
      ''
    ).trim();

    const domFallback = extractSectionsFromDOM($);

    // Clean noisy elements
    $('script, style, nav, footer, .navbox, .catlinks, .wds-global-navigation, .wds-community-header, .page-header__bottom, .page-footer, .reference').remove();

    const contentText = $('#mw-content-text, .mw-parser-output, main, article')
      .find('h1, h2, h3, h4, p, li')
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    const maxLength = 75000;
    const wikiText = contentText.length > maxLength
      ? contentText.substring(0, maxLength)
      : contentText;

    if (!wikiText || wikiText.length < 60) {
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
- initial_memory: 3-5 key canonical memories or facts
- categories: Array of 2-3 category tags from ["Anime", "Roleplay", "Action", "Fantasy", "Helper", "Mystery", "Slice of Life", "Game"]

Text:
${wikiText}`;

        const geminiResponse = await ai.models.generateContent({
          model: config.GEMINI_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const rawText = (geminiResponse.text || '')
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '');

        const extractedData = JSON.parse(rawText);

        const fields = [
          'name', 'tagline', 'greeting', 'appearance', 'personality',
          'abilities', 'background', 'speaking_style', 'initial_memory'
        ];
        for (const f of fields) {
          if (typeof extractedData[f] !== 'string') {
            extractedData[f] = domFallback[f] || '';
          }
        }

        if (!extractedData.name && pageTitle) {
          extractedData.name = pageTitle;
        }
        if (!Array.isArray(extractedData.categories) || extractedData.categories.length === 0) {
          extractedData.categories = ['Anime', 'Roleplay'];
        }
        if (extractedAvatar) {
          extractedData.avatar = extractedAvatar;
        }
        extractedData.wikiUrl = url;
        return extractedData;
      } catch (aiErr) {
        console.warn('[WIKI] Gemini extraction fallback to Cheerio DOM parser:', aiErr.message);
      }
    }

    // Return DOM-extracted data if Gemini call was skipped or rate-limited
    return {
      name: pageTitle,
      tagline: 'Imported from Wiki',
      greeting: '',
      appearance: domFallback.appearance,
      personality: domFallback.personality,
      abilities: domFallback.abilities,
      background: domFallback.background,
      speaking_style: '',
      initial_memory: '',
      categories: ['Anime', 'Roleplay'],
      avatar: extractedAvatar,
      wikiUrl: url
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof ValidationError) throw error;
    if (error.name === 'AbortError') {
      throw new AIError('Wiki parsing timeout', 504);
    }
    console.error('[WIKI] Parse error:', error.message);
    return {
      name: '',
      tagline: '',
      greeting: '',
      appearance: '',
      personality: '',
      abilities: '',
      background: '',
      speaking_style: '',
      initial_memory: '',
      categories: ['Roleplay'],
      avatar: '',
      wikiUrl: url
    };
  }
}
