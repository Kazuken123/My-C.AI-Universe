import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/index.js';

/**
 * R2StorageService Class
 * Deep module encapsulating Cloudflare R2 / S3-compatible cloud object storage
 * with zero-egress media persistence and graceful fallback handling.
 */
export class R2StorageService {
  #client = null;
  #bucketName = '';
  #publicUrl = '';
  #accountId = '';

  constructor(customConfig = null, injectedClient = null) {
    const activeConfig = customConfig || config;
    this.#accountId = activeConfig.R2_ACCOUNT_ID || '';
    this.#bucketName = activeConfig.R2_BUCKET_NAME || 'cai-universe-avatars';
    this.#publicUrl = (activeConfig.R2_PUBLIC_URL || '').replace(/\/+$/, '');

    if (injectedClient) {
      this.#client = injectedClient;
    } else if (this.isConfigured(activeConfig)) {
      try {
        this.#client = new S3Client({
          region: 'auto',
          endpoint: `https://${this.#accountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: activeConfig.R2_ACCESS_KEY_ID,
            secretAccessKey: activeConfig.R2_SECRET_ACCESS_KEY,
          },
        });
      } catch (err) {
        console.warn('[R2StorageService] Failed to initialize R2 S3 client:', err.message);
        this.#client = null;
      }
    }
  }

  /**
   * Check whether Cloudflare R2 credentials are fully configured
   * @param {Object} [cfg]
   * @returns {boolean}
   */
  isConfigured(cfg = config) {
    return Boolean(
      cfg.R2_ACCOUNT_ID &&
      cfg.R2_ACCESS_KEY_ID &&
      cfg.R2_SECRET_ACCESS_KEY &&
      cfg.R2_BUCKET_NAME
    );
  }

  /**
   * Upload an avatar buffer to Cloudflare R2 bucket
   * @param {Object} params
   * @param {string} params.filename
   * @param {Buffer} params.buffer
   * @param {string} params.mimeType
   * @returns {Promise<{ success: boolean, publicUrl?: string, error?: string }>}
   */
  async uploadAvatar({ filename, buffer, mimeType }) {
    if (!this.#client) {
      return { success: false, error: 'R2 storage client is not configured' };
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.#bucketName,
        Key: `avatars/${filename}`,
        Body: buffer,
        ContentType: mimeType,
      });

      await this.#client.send(command);

      const publicUrl = this.#publicUrl
        ? `${this.#publicUrl}/avatars/${filename}`
        : `/assets/avatars/${filename}`;

      return {
        success: true,
        publicUrl,
      };
    } catch (err) {
      console.warn(`[R2StorageService] R2 upload failed for ${filename}:`, err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Retrieve an avatar buffer and metadata from Cloudflare R2
   * @param {string} filename
   * @returns {Promise<{ buffer: Buffer, mimeType: string } | null>}
   */
  async getAvatar(filename) {
    if (!this.#client) return null;

    try {
      const command = new GetObjectCommand({
        Bucket: this.#bucketName,
        Key: `avatars/${filename}`,
      });

      const response = await this.#client.send(command);
      if (!response || !response.Body) return null;

      // Convert readable stream to buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const buffer = Buffer.concat(chunks);

      return {
        buffer,
        mimeType: response.ContentType || 'image/png',
      };
    } catch (err) {
      // Return null on NoSuchKey or network failures so callers fall back cleanly
      if (err.name !== 'NoSuchKey') {
        console.warn(`[R2StorageService] R2 fetch notice for ${filename}:`, err.message);
      }
      return null;
    }
  }

  /**
   * Delete an avatar from Cloudflare R2
   * @param {string} filename
   * @returns {Promise<boolean>}
   */
  async deleteAvatar(filename) {
    if (!this.#client) return false;

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.#bucketName,
        Key: `avatars/${filename}`,
      });
      await this.#client.send(command);
      return true;
    } catch (err) {
      console.warn(`[R2StorageService] R2 delete failed for ${filename}:`, err.message);
      return false;
    }
  }
}

export const r2StorageService = new R2StorageService();
