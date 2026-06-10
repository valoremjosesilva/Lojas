import { Injectable, Logger } from '@nestjs/common'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuid } from 'uuid'

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
])

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name)
  private readonly s3: S3Client
  private readonly bucket: string
  private readonly cdnUrl: string

  constructor() {
    const isR2 = process.env.STORAGE_PROVIDER === 'r2'
    this.s3 = new S3Client({
      region: process.env.STORAGE_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
        secretAccessKey: process.env.STORAGE_SECRET_KEY || '',
      },
      ...(isR2 && process.env.STORAGE_ENDPOINT
        ? { endpoint: process.env.STORAGE_ENDPOINT }
        : {}),
    })
    this.bucket = process.env.STORAGE_BUCKET || 'valorem-lojas-media'
    this.cdnUrl = (process.env.STORAGE_CDN_URL || '').replace(/\/$/, '')
  }

  async generateUploadUrl(
    storeId: string,
    folder: string,
    fileName: string,
    contentType: string,
  ) {
    if (!ALLOWED_TYPES.has(contentType)) {
      throw new Error(`Tipo de arquivo não permitido: ${contentType}`)
    }

    const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg'
    const key = `${storeId}/${folder}/${uuid()}.${ext}`

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 120 })
    const publicUrl = this.cdnUrl
      ? `${this.cdnUrl}/${key}`
      : uploadUrl.split('?')[0]

    return { uploadUrl, key, publicUrl }
  }

  async deleteFile(key: string) {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
    } catch (e: any) {
      this.logger.warn(`Falha ao remover arquivo ${key}: ${e.message}`)
    }
  }

  extractKey(publicUrl: string): string | null {
    if (this.cdnUrl && publicUrl.startsWith(this.cdnUrl)) {
      return publicUrl.slice(this.cdnUrl.length + 1)
    }
    return null
  }
}
