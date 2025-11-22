import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { logger } from '../utils/logger';

export const s3Client = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: true, // Required for MinIO
});

export const uploadToS3 = async (
  key: string,
  body: Buffer | string,
  contentType?: string
): Promise<string> => {
  try {
    const command = new PutObjectCommand({
      Bucket: config.s3.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await s3Client.send(command);
    const url = `${config.s3.endpoint}/${config.s3.bucketName}/${key}`;
    logger.debug(`✅ Uploaded to S3: ${url}`);
    return url;
  } catch (error) {
    logger.error('❌ Failed to upload to S3:', error);
    throw error;
  }
};

export const getSignedS3Url = async (key: string, expiresIn: number = 3600): Promise<string> => {
  try {
    const command = new GetObjectCommand({
      Bucket: config.s3.bucketName,
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    logger.error('❌ Failed to generate signed URL:', error);
    throw error;
  }
};

export const downloadFromS3 = async (key: string): Promise<Buffer> => {
  try {
    const command = new GetObjectCommand({
      Bucket: config.s3.bucketName,
      Key: key,
    });

    const response = await s3Client.send(command);
    const stream = response.Body as any;

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch (error) {
    logger.error('❌ Failed to download from S3:', error);
    throw error;
  }
};
