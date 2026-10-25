import { BaseRepository } from './BaseRepository.js';

/**
 * MediaAssetRepository Class (extends BaseRepository)
 * Encapsulates relational SQL queries for the media_assets table.
 */
export class MediaAssetRepository extends BaseRepository {
  constructor() {
    super('media_assets');
  }

  /**
   * Save or update an uploaded media asset blob
   * @param {Object} param0
   * @param {Object} [targetDb]
   * @returns {Promise<void>}
   */
  async saveAsset({ id, filename, mimeType, dataBase64, size }, targetDb = null) {
    const conn = targetDb || this.db;
    await conn.prepare(`
      INSERT OR REPLACE INTO media_assets (id, filename, mime_type, data_base64, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, filename, mimeType, dataBase64, size, new Date().toISOString());
  }

  /**
   * Retrieve asset binary data by filename
   * @param {string} filename
   * @param {Object} [targetDb]
   * @returns {Promise<Object|null>}
   */
  async findByFilename(filename, targetDb = null) {
    const conn = targetDb || this.db;
    const row = await conn.prepare(`
      SELECT mime_type, data_base64 FROM media_assets WHERE filename = ?
    `).get(filename);
    return row || null;
  }
}

export const mediaAssetRepository = new MediaAssetRepository();
