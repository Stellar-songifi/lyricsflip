// src/replay-analysis/storage/replay-storage.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class ReplayStorageService {
  private readonly logger = new Logger(ReplayStorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get('REPLAY_BUCKET_NAME', 'game-replays');
    
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  async storeReplay(replayId: string, file: Buffer, filename: string): Promise<string> {
    try {
      const key = `replays/${replayId}/${filename}`;
      
      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file,
        ContentType: 'application/octet-stream',
      }));
      
      // Generate pre-signed URL that expires in 1 hour
      const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key });
      const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      
      return url;
    } catch (error) {
      this.logger.error(`Error storing replay: ${error.message}`);
      throw error;
    }
  }

  async getReplayUrl(replayId: string, filename: string): Promise<string> {
    const key = `replays/${replayId}/${filename}`;
    const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key });
    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }
}
