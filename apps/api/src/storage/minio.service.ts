import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Client } from "minio";

export interface StoredObject {
  stream: NodeJS.ReadableStream;
  size: number;
  contentType: string;
}

// Wraps the MinIO SDK behind a small interface the rest of the app depends
// on, not the client directly - deliberately optional-by-configuration
// (docs/PROJECT-PHASES-PLAN.md Phase 12: an attachment is optional on a
// fault report), so the whole maintenance flow keeps working when nobody
// has set MINIO_* yet; only an actual upload/download needs it reachable.
@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: Client | null;
  private readonly bucket: string;
  private bucketEnsured = false;

  constructor() {
    this.bucket = process.env.MINIO_BUCKET || "dcms-maintenance";
    const endPoint = process.env.MINIO_ENDPOINT;
    const accessKey = process.env.MINIO_ACCESS_KEY;
    const secretKey = process.env.MINIO_SECRET_KEY;
    if (!endPoint || !accessKey || !secretKey) {
      this.client = null;
      return;
    }
    this.client = new Client({
      endPoint,
      port: process.env.MINIO_PORT ? Number(process.env.MINIO_PORT) : 9000,
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey,
      secretKey,
    });
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        "File storage is not configured on this server - set MINIO_ENDPOINT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY",
      );
    }
    return this.client;
  }

  private async ensureBucket(client: Client) {
    if (this.bucketEnsured) return;
    const exists = await client.bucketExists(this.bucket).catch(() => false);
    if (!exists) {
      await client.makeBucket(this.bucket);
      this.logger.log(`Created MinIO bucket "${this.bucket}"`);
    }
    this.bucketEnsured = true;
  }

  // Returns the object key (not a public URL) - retrieval always goes back
  // through this app's own gated endpoint, never a guessable bucket URL.
  async upload(buffer: Buffer, originalName: string, mimetype: string): Promise<string> {
    const client = this.requireClient();
    await this.ensureBucket(client);
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectKey = `${randomUUID()}-${safeName}`;
    await client.putObject(this.bucket, objectKey, buffer, buffer.length, { "Content-Type": mimetype });
    return objectKey;
  }

  async getObject(objectKey: string): Promise<StoredObject> {
    const client = this.requireClient();
    const stat = await client.statObject(this.bucket, objectKey);
    const stream = await client.getObject(this.bucket, objectKey);
    return {
      stream,
      size: stat.size,
      contentType: (stat.metaData?.["content-type"] as string | undefined) ?? "application/octet-stream",
    };
  }

  // Best-effort cleanup - called when a DB transaction fails after an
  // upload already succeeded (docs review DCMS-003's lesson applied here:
  // never leave an orphaned resource behind when it's cheap to avoid).
  // Never throws - a failed cleanup is a harmless leftover object, not
  // worth masking the original error over.
  async remove(objectKey: string): Promise<void> {
    if (!this.client) return;
    await this.client.removeObject(this.bucket, objectKey).catch((error) => {
      this.logger.warn(`Failed to remove orphaned object ${objectKey}: ${error}`);
    });
  }
}
