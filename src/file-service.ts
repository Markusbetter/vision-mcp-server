import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { lookup } from 'node:dns/promises';
import sharp from 'sharp';
import { VisionError, errorMessage } from './errors.js';

export interface ImageProcessingOptions {
  maxBytes: number;
  maxPixels: number;
  maxImageEdge: number;
  timeoutMs: number;
  allowedDirs: string[];
}

export interface PreparedImage {
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/png';
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  resized: boolean;
  sourceType: 'local' | 'url' | 'data';
}

const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);
const MAX_REDIRECTS = 3;

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

export function isPrivateAddress(address: string): boolean {
  if (net.isIP(address) === 4) return isPrivateIpv4(address);
  if (net.isIP(address) !== 6) return true;

  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? isPrivateIpv4(mapped) : false;
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new VisionError('IMAGE_DOWNLOAD_FAILED', `不支持的图片 URL 协议：${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new VisionError('IMAGE_NOT_ALLOWED', '图片 URL 不能包含用户名或密码');
  }

  const addresses = net.isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new VisionError('IMAGE_NOT_ALLOWED', `出于安全原因，不能从内网或本机地址读取图片：${url.hostname}`);
  }
}

async function readResponseWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new VisionError('IMAGE_TOO_LARGE', `在线图片超过 ${maxBytes} 字节限制`);
  }
  if (!response.body) throw new VisionError('IMAGE_DOWNLOAD_FAILED', '在线图片响应没有内容');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new VisionError('IMAGE_TOO_LARGE', `在线图片超过 ${maxBytes} 字节限制`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

async function downloadImage(source: string, options: ImageProcessingOptions): Promise<Buffer> {
  let current = new URL(source);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertPublicUrl(current);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs),
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8,*/*;q=0.1' },
      });
    } catch (error) {
      throw new VisionError('IMAGE_DOWNLOAD_FAILED', `下载图片失败：${errorMessage(error)}`, error);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new VisionError('IMAGE_DOWNLOAD_FAILED', `图片重定向缺少 Location（HTTP ${response.status}）`);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new VisionError('IMAGE_DOWNLOAD_FAILED', `下载图片失败：HTTP ${response.status}`);
    return readResponseWithLimit(response, options.maxBytes);
  }
  throw new VisionError('IMAGE_DOWNLOAD_FAILED', `图片 URL 重定向超过 ${MAX_REDIRECTS} 次`);
}

function parseDataUrl(source: string, maxBytes: number): Buffer {
  const match = source.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) throw new VisionError('IMAGE_FORMAT_UNSUPPORTED', '图片 data URL 格式无效');
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (buffer.length === 0) throw new VisionError('IMAGE_FORMAT_UNSUPPORTED', '图片 data URL 内容为空');
  if (buffer.length > maxBytes) throw new VisionError('IMAGE_TOO_LARGE', `图片超过 ${maxBytes} 字节限制`);
  return buffer;
}

async function assertAllowedPath(filePath: string, allowedDirs: string[]): Promise<string> {
  let realPath: string;
  try {
    realPath = await fs.realpath(filePath);
  } catch {
    throw new VisionError('IMAGE_NOT_FOUND', `找不到图片文件：${filePath}`);
  }

  if (allowedDirs.length === 0) return realPath;
  const realRoots = await Promise.all(allowedDirs.map(async (root) => {
    try {
      return await fs.realpath(path.resolve(root));
    } catch {
      throw new VisionError('IMAGE_NOT_ALLOWED', `允许目录不存在：${root}`);
    }
  }));
  const allowed = realRoots.some((root) => {
    const relative = path.relative(root, realPath);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  });
  if (!allowed) throw new VisionError('IMAGE_NOT_ALLOWED', `图片不在 VISION_ALLOWED_DIRS 允许的目录中：${realPath}`);
  return realPath;
}

async function readLocalImage(source: string, options: ImageProcessingOptions): Promise<Buffer> {
  const realPath = await assertAllowedPath(path.resolve(source), options.allowedDirs);
  const stat = await fs.stat(realPath);
  if (!stat.isFile()) throw new VisionError('IMAGE_FORMAT_UNSUPPORTED', `图片路径不是文件：${realPath}`);
  if (stat.size > options.maxBytes) throw new VisionError('IMAGE_TOO_LARGE', `图片超过 ${options.maxBytes} 字节限制`);
  return fs.readFile(realPath);
}

async function normalizeImage(buffer: Buffer, sourceType: PreparedImage['sourceType'], options: ImageProcessingOptions): Promise<PreparedImage> {
  try {
    const input = sharp(buffer, { limitInputPixels: options.maxPixels, animated: false, failOn: 'error' });
    const metadata = await input.metadata();
    if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format) || !metadata.width || !metadata.height) {
      throw new VisionError('IMAGE_FORMAT_UNSUPPORTED', '仅支持有效的 JPEG、PNG、WebP 或 GIF 图片');
    }

    const orientationSwapsAxes = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
    const originalWidth = orientationSwapsAxes ? metadata.height : metadata.width;
    const originalHeight = orientationSwapsAxes ? metadata.width : metadata.height;
    const pipeline = input.rotate().resize({
      width: options.maxImageEdge,
      height: options.maxImageEdge,
      fit: 'inside',
      withoutEnlargement: true,
    });
    const hasAlpha = metadata.hasAlpha === true;
    const output = hasAlpha
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    if (output.data.length > options.maxBytes) {
      throw new VisionError('IMAGE_TOO_LARGE', `处理后的图片超过 ${options.maxBytes} 字节限制`);
    }

    return {
      dataUrl: `data:${hasAlpha ? 'image/png' : 'image/jpeg'};base64,${output.data.toString('base64')}`,
      mimeType: hasAlpha ? 'image/png' : 'image/jpeg',
      originalWidth,
      originalHeight,
      width: output.info.width,
      height: output.info.height,
      resized: output.info.width !== originalWidth || output.info.height !== originalHeight,
      sourceType,
    };
  } catch (error) {
    if (error instanceof VisionError) throw error;
    const message = errorMessage(error);
    const code = /pixel limit|Input image exceeds pixel limit/i.test(message) ? 'IMAGE_TOO_LARGE' : 'IMAGE_FORMAT_UNSUPPORTED';
    throw new VisionError(code, `无法处理图片：${message}`, error);
  }
}

export class FileService {
  static isUrl(source: string): boolean {
    try {
      const url = new URL(source);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  static async processImageInput(imageInput: string, options: ImageProcessingOptions): Promise<PreparedImage> {
    let buffer: Buffer;
    let sourceType: PreparedImage['sourceType'];
    if (imageInput.startsWith('data:')) {
      buffer = parseDataUrl(imageInput, options.maxBytes);
      sourceType = 'data';
    } else if (this.isUrl(imageInput)) {
      buffer = await downloadImage(imageInput, options);
      sourceType = 'url';
    } else {
      buffer = await readLocalImage(imageInput, options);
      sourceType = 'local';
    }
    return normalizeImage(buffer, sourceType, options);
  }
}
