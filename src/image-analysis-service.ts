import { z } from 'zod/v3';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from './config.js';
import { FileService } from './file-service.js';
import { ChatService } from './chat-service.js';
import { VisionError, errorMessage } from './errors.js';

const AnalyzeImageParamsShape = {
  image: z.string().min(1).describe('图片 URL、本地文件路径或 data URL'),
  prompt: z.string().optional().default('请描述这张图片的内容').describe('对图片的问题或分析要求'),
};
const AnalyzeImageParamsSchema = z.object(AnalyzeImageParamsShape);

export type AnalyzeImageParams = z.infer<typeof AnalyzeImageParamsSchema>;

export class ImageAnalysisService {
  private readonly chatService: ChatService;

  constructor(private readonly config: AppConfig) {
    this.chatService = new ChatService(config.routes, {
      fallbackCooldownMs: config.fallbackCooldownMs,
      debug: config.debug,
    });
  }

  async analyzeImage(params: AnalyzeImageParams): Promise<string> {
    const validatedParams = AnalyzeImageParamsSchema.parse(params);
    const maxImageEdge = Math.min(...this.config.routes.map((route) => route.maxImageEdge));
    const image = await FileService.processImageInput(validatedParams.image, {
      ...this.config.image,
      maxImageEdge,
    });

    if (this.config.debug) {
      process.stderr.write(`[vision-mcp] image ${image.originalWidth}x${image.originalHeight} -> ${image.width}x${image.height}, source=${image.sourceType}\n`);
    }
    return this.chatService.visionCompletions(image.dataUrl, validatedParams.prompt);
  }
}

function displayError(error: unknown): string {
  if (error instanceof VisionError) return `[${error.code}] ${error.message}`;
  if (error instanceof z.ZodError) return `参数无效：${error.issues.map((issue) => issue.message).join('；')}`;
  return errorMessage(error);
}

export function registerImageAnalysisTool(server: McpServer, config: AppConfig): void {
  const imageAnalysisService = new ImageAnalysisService(config);

  server.registerTool(
    'analyze_image',
    {
      title: '分析图片',
      description: '使用可配置的视觉模型分析图片；遇到限流、超时或服务故障时可自动切换备用模型',
      inputSchema: AnalyzeImageParamsShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: AnalyzeImageParams) => {
      try {
        const result = await imageAnalysisService.analyzeImage(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (error) {
        const message = displayError(error);
        process.stderr.write(`分析图片时出错: ${message}\n`);
        return { content: [{ type: 'text' as const, text: `分析图片时出错: ${message}` }], isError: true };
      }
    },
  );
}
