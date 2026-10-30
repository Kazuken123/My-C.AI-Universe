import test from 'node:test';
import assert from 'node:assert/strict';

if (process.env.NODE_ENV !== 'test' || !process.env.DOTENV_CONFIG_PATH) {
  throw new Error('Run through scripts/run-tests.js to isolate credentials.');
}

const { R2StorageService } = await import('../backend/services/r2.service.js');
const { AuthService } = await import('../backend/services/auth.service.js');

test('R2StorageService reports unconfigured when credentials are missing', () => {
  const service = new R2StorageService({
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET_NAME: 'test-bucket'
  });

  assert.equal(service.isConfigured({ R2_ACCOUNT_ID: '' }), false);
});

test('R2StorageService gracefully fails and returns error when client is unconfigured', async () => {
  const service = new R2StorageService({
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: ''
  });

  const uploadRes = await service.uploadAvatar({
    filename: 'test.png',
    buffer: Buffer.from('fake-data'),
    mimeType: 'image/png'
  });

  assert.equal(uploadRes.success, false);
  assert.match(uploadRes.error, /not configured/);

  const getRes = await service.getAvatar('nonexistent.png');
  assert.equal(getRes, null);

  const delRes = await service.deleteAvatar('nonexistent.png');
  assert.equal(delRes, false);
});

test('R2StorageService successfully uploads, retrieves, and deletes with injected S3 client', async () => {
  const mockStorage = new Map();

  const mockClient = {
    send: async (command) => {
      const cmdName = command.constructor?.name || '';
      if (cmdName === 'PutObjectCommand' || command.input?.Key) {
        if (cmdName === 'GetObjectCommand') {
          const item = mockStorage.get(command.input.Key);
          if (!item) {
            const err = new Error('NoSuchKey');
            err.name = 'NoSuchKey';
            throw err;
          }
          return {
            Body: (async function* () {
              yield item.buffer;
            })(),
            ContentType: item.mimeType
          };
        }

        if (cmdName === 'DeleteObjectCommand') {
          mockStorage.delete(command.input.Key);
          return {};
        }

        // PutObjectCommand
        mockStorage.set(command.input.Key, {
          buffer: command.input.Body,
          mimeType: command.input.ContentType
        });
        return {};
      }
      throw new Error(`Unhandled mock command: ${cmdName}`);
    }
  };

  const service = new R2StorageService(
    {
      R2_ACCOUNT_ID: 'mock_acc',
      R2_ACCESS_KEY_ID: 'mock_key',
      R2_SECRET_ACCESS_KEY: 'mock_sec',
      R2_BUCKET_NAME: 'mock-bucket',
      R2_PUBLIC_URL: 'https://cdn.cai-universe.com'
    },
    mockClient
  );

  assert.equal(service.isConfigured({
    R2_ACCOUNT_ID: 'mock_acc',
    R2_ACCESS_KEY_ID: 'mock_key',
    R2_SECRET_ACCESS_KEY: 'mock_sec',
    R2_BUCKET_NAME: 'mock-bucket'
  }), true);

  // Upload
  const uploadRes = await service.uploadAvatar({
    filename: 'avatar_user1.png',
    buffer: Buffer.from('png-binary-stream'),
    mimeType: 'image/png'
  });

  assert.equal(uploadRes.success, true);
  assert.equal(uploadRes.publicUrl, 'https://cdn.cai-universe.com/avatars/avatar_user1.png');
  assert.ok(mockStorage.has('avatars/avatar_user1.png'));

  // Get
  const getRes = await service.getAvatar('avatar_user1.png');
  assert.ok(getRes);
  assert.equal(getRes.mimeType, 'image/png');
  assert.equal(getRes.buffer.toString(), 'png-binary-stream');

  // Delete
  const delRes = await service.deleteAvatar('avatar_user1.png');
  assert.equal(delRes, true);
  assert.equal(mockStorage.has('avatars/avatar_user1.png'), false);

  // Get deleted returns null
  const getAfterDel = await service.getAvatar('avatar_user1.png');
  assert.equal(getAfterDel, null);
});

test('AuthService.saveBase64Avatar integrates with StorageService seamlessly', async () => {
  let uploadedToCloud = false;
  const mockStorageService = {
    uploadAvatar: async ({ filename, buffer, mimeType }) => {
      uploadedToCloud = true;
      return { success: true, publicUrl: `/assets/avatars/${filename}` };
    }
  };

  let savedToSql = false;
  const mockMediaAssetRepo = {
    saveAsset: async (asset) => {
      savedToSql = true;
      return asset;
    }
  };

  const authService = new AuthService(
    {}, {}, {},
    mockMediaAssetRepo,
    mockStorageService
  );

  // Valid 1x1 transparent PNG data URL with proper PNG magic bytes (\x89PNG)
  const validPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const result = await authService.saveBase64Avatar(validPngDataUrl);

  assert.ok(result.filename.startsWith('avatar_'));
  assert.ok(result.url.startsWith('/assets/avatars/'));
  assert.equal(uploadedToCloud, true);
  assert.equal(savedToSql, true);
});
