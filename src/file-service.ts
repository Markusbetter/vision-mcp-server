import fs from 'fs';
import path from 'path';
import { URL } from 'url';

/**
 * 文件服务类，处理文件验证和编码
 */
export class FileService {
  /**
   * 判断输入是否为URL
   */
  static isUrl(source: string): boolean {
    try {
      const url = new URL(source);
      // 只允许http和https协议
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * 将本地图片转换为base64
   */
  static async encodeImageToBase64(imagePath: string): Promise<string> {
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const mimeType = this.getMimeType(imagePath);
      const base64 = imageBuffer.toString('base64');
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      throw new Error(`Failed to encode image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取文件的MIME类型
   */
  static getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * 验证图片来源
   */
  static async validateImageSource(source: string): Promise<{ type: 'url' | 'local'; source: string }> {
    if (this.isUrl(source)) {
      return { type: 'url', source };
    } else {
      // 如果是相对路径，尝试多个可能的目录
      let absolutePath = source;
      if (!path.isAbsolute(source)) {
        // 首先尝试当前工作目录
        absolutePath = path.resolve(process.cwd(), source);
        
        if (!fs.existsSync(absolutePath)) {
          // 如果当前工作目录找不到，尝试项目目录
          // 在ES模块中使用import.meta.url替代__dirname
          const projectDir = path.dirname(new URL(import.meta.url).pathname);
          let altPath = path.resolve(projectDir, '..', source);
          
          if (fs.existsSync(altPath)) {
            absolutePath = altPath;
          } else {
            // 尝试从package.json所在目录查找
            const packageDir = path.resolve(projectDir, '..');
            altPath = path.resolve(packageDir, source);
            
            if (fs.existsSync(altPath)) {
              absolutePath = altPath;
            }
          }
        }
      }
      
      // 检查文件是否存在
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Image file not found: ${absolutePath} (original: ${source})`);
      }
      return { type: 'local', source: absolutePath };
    }
  }

  /**
   * 处理图片输入，返回可用于API的格式
   */
  static async processImageInput(imageInput: string): Promise<string> {
    const validatedSource = await this.validateImageSource(imageInput);
    
    if (validatedSource.type === 'url') {
      // 直接使用URL
      return imageInput;
    } else {
      // 转换本地图片为base64，使用验证后的绝对路径
      return await this.encodeImageToBase64(validatedSource.source);
    }
  }
}
