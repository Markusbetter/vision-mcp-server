import { z } from 'zod';

export const DEFAULT_MODELSCOPE_MODELS = [
  'Qwen/Qwen3.5-397B-A17B',
  'Qwen/Qwen3.5-35B-A3B',
];

const RouteSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().url(),
  apiKeyEnv: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  model: z.string().min(1).optional(),
  models: z.array(z.string().min(1)).min(1).optional(),
  headers: z.record(z.string()).optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  maxImageEdge: z.number().int().min(64).max(16_384).optional(),
  extraBody: z.record(z.unknown()).optional(),
}).refine((route) => Boolean(route.model) !== Boolean(route.models), {
  message: '每条路由必须设置 model 或 models，且不能同时设置',
});

export interface VisionRoute {
  name: string;
  baseUrl: string;
  apiKey: string;
  apiKeyEnv: string;
  model: string;
  headers?: Record<string, string>;
  timeoutMs: number;
  maxImageEdge: number;
  extraBody?: Record<string, unknown>;
}

export interface AppConfig {
  routes: VisionRoute[];
  image: {
    maxBytes: number;
    maxPixels: number;
    timeoutMs: number;
    allowedDirs: string[];
  };
  fallbackCooldownMs: number;
  debug: boolean;
}

function integerEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} 必须是正整数`);
  }
  return value;
}

function listEnv(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

type RawRoute = z.infer<typeof RouteSchema>;

function resolveRoutes(rawRoutes: RawRoute[], env: NodeJS.ProcessEnv, defaultEdge: number, defaultTimeout: number): VisionRoute[] {
  return rawRoutes.flatMap((route, routeIndex) => {
    const apiKey = env[route.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`路由 ${route.name ?? routeIndex + 1} 引用的环境变量 ${route.apiKeyEnv} 未设置`);
    }

    const models = route.models ?? [route.model!];
    return models.map((model, modelIndex) => ({
      name: route.name
        ? (models.length > 1 ? `${route.name}-${modelIndex + 1}` : route.name)
        : `route-${routeIndex + 1}-${modelIndex + 1}`,
      baseUrl: normalizeBaseUrl(route.baseUrl),
      apiKey,
      apiKeyEnv: route.apiKeyEnv,
      model,
      headers: route.headers,
      timeoutMs: route.timeoutMs ?? defaultTimeout,
      maxImageEdge: route.maxImageEdge ?? defaultEdge,
      extraBody: route.extraBody,
    }));
  });
}

function presetRoutes(env: NodeJS.ProcessEnv): RawRoute[] {
  const provider = env.VISION_PROVIDER?.toLowerCase();
  const configuredModels = listEnv(env.VISION_MODELS);

  if (provider === 'zhipu') {
    if (configuredModels.length === 0) {
      throw new Error('智谱模式需要设置 VISION_MODELS，请填写一个或多个视觉模型 ID');
    }
    return [{
      name: 'zhipu',
      baseUrl: env.OPENAI_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
      apiKeyEnv: env.VISION_API_KEY_ENV ?? 'ZAI_API_KEY',
      models: configuredModels,
    }];
  }

  if (provider === 'openai-compatible' || env.OPENAI_BASE_URL) {
    const models = configuredModels.length > 0
      ? configuredModels
      : listEnv(env.OPENAI_MODELS ?? env.VISION_MODEL);
    if (models.length === 0) {
      throw new Error('通用 OpenAI 兼容模式需要设置 VISION_MODELS');
    }
    return [{
      name: 'openai-compatible',
      baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      apiKeyEnv: env.VISION_API_KEY_ENV ?? 'OPENAI_API_KEY',
      models,
    }];
  }

  const models = listEnv(env.MODELSCOPE_MODELS);
  const legacyModel = env.MODELSCOPE_MODEL?.trim();
  return [{
    name: 'modelscope',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    apiKeyEnv: 'MODELSCOPE_TOKEN',
    models: models.length > 0
      ? models
      : (legacyModel ? [legacyModel] : DEFAULT_MODELSCOPE_MODELS),
    maxImageEdge: 2048,
  }];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const defaultEdge = integerEnv(env, 'VISION_MAX_IMAGE_EDGE', 2048);
  const defaultTimeout = integerEnv(env, 'VISION_REQUEST_TIMEOUT_MS', 60_000);
  let rawRoutes: RawRoute[];

  if (env.VISION_ROUTES) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(env.VISION_ROUTES);
    } catch {
      throw new Error('VISION_ROUTES 不是有效的 JSON');
    }
    rawRoutes = z.array(RouteSchema).min(1).parse(parsed);
  } else {
    rawRoutes = presetRoutes(env);
  }

  const routes = resolveRoutes(rawRoutes, env, defaultEdge, defaultTimeout);
  if (routes.length === 0) throw new Error('至少需要配置一个视觉模型路由');

  return {
    routes,
    image: {
      maxBytes: integerEnv(env, 'VISION_MAX_IMAGE_BYTES', 20 * 1024 * 1024),
      maxPixels: integerEnv(env, 'VISION_MAX_IMAGE_PIXELS', 40_000_000),
      timeoutMs: integerEnv(env, 'VISION_IMAGE_DOWNLOAD_TIMEOUT_MS', 15_000),
      allowedDirs: listEnv(env.VISION_ALLOWED_DIRS),
    },
    fallbackCooldownMs: integerEnv(env, 'VISION_FALLBACK_COOLDOWN_MS', 60_000),
    debug: env.VISION_DEBUG === '1' || env.VISION_DEBUG === 'true',
  };
}

export function publicConfigSummary(config: AppConfig): object {
  return {
    routes: config.routes.map(({ apiKey: _apiKey, headers, extraBody, ...route }) => ({
      ...route,
      headers: headers ? Object.fromEntries(Object.keys(headers).map((key) => [key, '[REDACTED]'])) : undefined,
      extraBodyKeys: extraBody ? Object.keys(extraBody) : undefined,
    })),
    image: config.image,
    fallbackCooldownMs: config.fallbackCooldownMs,
    debug: config.debug,
  };
}
