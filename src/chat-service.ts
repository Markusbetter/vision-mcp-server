import OpenAI from 'openai';
import type { VisionRoute } from './config.js';
import { VisionError, errorMessage } from './errors.js';

interface AttemptFailure {
  route: string;
  model: string;
  status?: number;
  providerCode?: string;
  message: string;
}

interface ChatServiceOptions {
  fallbackCooldownMs: number;
  debug?: boolean;
  now?: () => number;
}

const FALLBACK_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
}

function providerCodeOf(error: unknown): string | undefined {
  const candidate = error as { code?: unknown; error?: { code?: unknown } };
  const code = candidate?.error?.code ?? candidate?.code;
  return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined;
}

function isConnectionFailure(error: unknown): boolean {
  const name = (error as { name?: unknown })?.name;
  const code = (error as { code?: unknown })?.code;
  return name === 'APIConnectionError'
    || name === 'APIConnectionTimeoutError'
    || code === 'ECONNRESET'
    || code === 'ECONNREFUSED'
    || code === 'ETIMEDOUT'
    || code === 'ENOTFOUND';
}

function retryAfterMs(error: unknown, fallback: number): number {
  const headers = (error as { headers?: unknown })?.headers;
  let raw: string | null | undefined;
  if (headers instanceof Headers) raw = headers.get('retry-after');
  else if (headers && typeof headers === 'object') {
    const record = headers as Record<string, unknown>;
    const value = record['retry-after'] ?? record['Retry-After'];
    raw = typeof value === 'string' ? value : undefined;
  }
  if (!raw) return fallback;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : fallback;
}

function cleanError(error: unknown): string {
  const status = statusOf(error);
  const code = providerCodeOf(error);
  const prefix = [status ? `HTTP ${status}` : undefined, code ? `code ${code}` : undefined].filter(Boolean).join(', ');
  const message = errorMessage(error).replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/g, '[image data removed]');
  return prefix ? `${prefix}: ${message}` : message;
}

export class ChatService {
  private readonly cooldownUntil = new Map<string, number>();
  private readonly now: () => number;

  constructor(
    private readonly routes: VisionRoute[],
    private readonly options: ChatServiceOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  private routeKey(route: VisionRoute): string {
    return `${route.name}\u0000${route.model}`;
  }

  private log(message: string): void {
    if (this.options.debug) process.stderr.write(`[vision-mcp] ${message}\n`);
  }

  private candidates(): VisionRoute[] {
    const now = this.now();
    const available = this.routes.filter((route) => (this.cooldownUntil.get(this.routeKey(route)) ?? 0) <= now);
    if (available.length > 0) return available;
    const earliest = [...this.routes].sort((a, b) =>
      (this.cooldownUntil.get(this.routeKey(a)) ?? 0) - (this.cooldownUntil.get(this.routeKey(b)) ?? 0));
    return earliest.slice(0, 1);
  }

  async visionCompletions(imageDataUrl: string, prompt: string): Promise<string> {
    const failures: AttemptFailure[] = [];
    const candidates = this.candidates();

    for (let index = 0; index < candidates.length; index += 1) {
      const route = candidates[index];
      this.log(`trying route=${route.name} model=${route.model}`);
      const client = new OpenAI({
        baseURL: route.baseUrl,
        apiKey: route.apiKey,
        defaultHeaders: route.headers,
        timeout: route.timeoutMs,
        maxRetries: 0,
      });

      try {
        const requestBody = {
          ...(route.extraBody ?? {}),
          model: route.model,
          messages: [{
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: prompt || '请描述这张图片的内容' },
              { type: 'image_url' as const, image_url: { url: imageDataUrl } },
            ],
          }],
          stream: false as const,
        };
        const response = await client.chat.completions.create(requestBody as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('接口响应缺少 choices[0].message.content');
        this.log(`route succeeded route=${route.name} model=${route.model}`);
        return content;
      } catch (error) {
        const status = statusOf(error);
        const providerCode = providerCodeOf(error);
        const fallback = (status !== undefined && FALLBACK_STATUSES.has(status)) || isConnectionFailure(error);
        const failure = {
          route: route.name,
          model: route.model,
          status,
          providerCode,
          message: cleanError(error).replaceAll(route.apiKey, '[REDACTED]'),
        };
        failures.push(failure);
        this.log(`route failed route=${route.name} model=${route.model} ${failure.message}`);

        if (!fallback) {
          throw new VisionError('PROVIDER_REQUEST_FAILED',
            `视觉模型 ${route.model} 请求失败，未执行 fallback：${failure.message}`, error);
        }

        const cooldown = retryAfterMs(error, this.options.fallbackCooldownMs);
        this.cooldownUntil.set(this.routeKey(route), this.now() + cooldown);
        if (index === candidates.length - 1) break;
      }
    }

    const rateLimited = failures.length > 0 && failures.every((failure) => failure.status === 429);
    const summary = failures.map((failure) => `${failure.route}/${failure.model}: ${failure.message}`).join('；');
    throw new VisionError(
      rateLimited ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_UNAVAILABLE',
      `所有视觉模型路由均不可用：${summary}`,
    );
  }
}
