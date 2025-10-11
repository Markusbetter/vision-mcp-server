import { z } from 'zod';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { FileService } from './file-service.js';
import { ChatService } from './chat-service.js';

// 定义参数验证模式
const AnalyzeImageParamsSchema = z.object({
  image: z.string().describe("图片URL或本地文件路径"),
  prompt: z.string().optional().default("请描述这张图片的内容").describe("对图片的问题或分析要求"),
});

export type AnalyzeImageParams = z.infer<typeof AnalyzeImageParamsSchema>;

/**
 * 图片分析服务类
 */
export class ImageAnalysisService {
  private chatService: ChatService;

  constructor(apiKey: string, model: string) {
    this.chatService = new ChatService(apiKey, model);
  }

  /**
   * 分析图片
   */
  async analyzeImage(params: AnalyzeImageParams): Promise<string> {
    // 验证参数
    const validatedParams = AnalyzeImageParamsSchema.parse(params);
    
    // 处理图片输入
    const imageUrl = await FileService.processImageInput(validatedParams.image);
    
    // 调用聊天服务进行分析
    return await this.chatService.visionCompletions(imageUrl, validatedParams.prompt);
  }
}

/**
 * 注册图片分析工具到MCP服务器
 */
export function registerImageAnalysisTool(server: Server, apiKey: string, model?: string) {
  const imageAnalysisService = new ImageAnalysisService(apiKey, model || "Qwen/Qwen3-VL-30B-A3B-Instruct");

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "analyze_image",
          description: "分析图片内容并提供详细描述",
          inputSchema: {
            type: "object",
            properties: {
              image: {
                type: "string",
                description: "图片URL或本地文件路径",
              },
              prompt: {
                type: "string",
                description: "对图片的问题或分析要求",
                default: "请描述这张图片的内容",
              },
            },
            required: ["image"],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "analyze_image") {
      try {
        const result = await imageAnalysisService.analyzeImage(args as AnalyzeImageParams);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error) {
        // 使用stderr输出错误信息，避免干扰MCP通信
        process.stderr.write(`分析图片时出错: ${error instanceof Error ? error.message : String(error)}\n`);
        return {
          content: [
            {
              type: "text",
              text: `分析图片时出错: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    } else {
      return {
        content: [
          {
            type: "text",
            text: `未知工具: ${name}`,
          },
        ],
        isError: true,
      };
    }
  });
}
