import { uploadToS3 } from '../lib/s3';
import { logger } from '../utils/logger';

export const uploadFile = async (
  buffer: Buffer,
  key: string,
  mimeType: string
): Promise<{ url: string; key: string }> => {
  try {
    const url = await uploadToS3(key, buffer, mimeType);
    logger.info(`File uploaded successfully: ${key}`);
    return { url, key };
  } catch (error) {
    logger.error('Failed to upload file:', error);
    throw new Error('File upload failed');
  }
};
