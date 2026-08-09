export type VisionErrorCode =
  | 'CONFIG_ERROR'
  | 'IMAGE_NOT_FOUND'
  | 'IMAGE_NOT_ALLOWED'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_FORMAT_UNSUPPORTED'
  | 'IMAGE_DOWNLOAD_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_REQUEST_FAILED';

export class VisionError extends Error {
  constructor(
    public readonly code: VisionErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VisionError';
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
