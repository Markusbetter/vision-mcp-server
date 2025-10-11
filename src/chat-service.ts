import { OpenAI } from 'openai';

/**
 * 聊天服务类，处理与魔搭社区API的通信
 */
export class ChatService {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = "Qwen/Qwen3-VL-30B-A3B-Instruct") {
    this.client = new OpenAI({
      baseURL: 'https://api-inference.modelscope.cn/v1',
      apiKey: apiKey,
    });
    this.model = model;
  }

  /**
   * 魔搭社区视觉分析API
   */
  async visionCompletions(imageUrl: string, prompt: string, options: any = {}): Promise<string> {
    // 移除console.info日志，避免干扰MCP通信

    try {
      // 处理图片URL，如果是base64格式，需要特殊处理
      let imageContent: any;
      if (imageUrl.startsWith('data:')) {
        // 处理base64编码的图片
        // 魔搭API需要完整的data URL格式
        imageContent = {
          type: 'image_url' as const,
          image_url: {
            url: imageUrl,
            detail: 'auto'
          },
        };
      } else {
        // 处理普通URL
        imageContent = {
          type: 'image_url' as const,
          image_url: {
            url: imageUrl,
            detail: 'auto'
          },
        };
      }

      // 构建消息
      const messages = [
        {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text: prompt || "请描述这张图片的内容",
            },
            imageContent,
          ],
        },
      ];

      // 调用魔搭社区API
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        stream: false,
        temperature: options.temperature ?? 0.7,
        top_p: options.topP ?? 1.0,
        ...(options.maxTokens && { max_tokens: options.maxTokens })
      });

      const result = response.choices[0]?.message?.content;
      if (!result) {
        throw new Error('Invalid API response: missing content');
      }

      // 移除console.info日志，避免干扰MCP通信
      return result;
    } catch (error) {
      // 使用stderr输出错误信息，避免干扰MCP通信
      process.stderr.write(`Request ModelScope API for vision analysis failed: ${error instanceof Error ? error.message : String(error)}\n`);
      throw error instanceof Error ? error : new Error(`API call failed: ${error}`);
    }
  }
}