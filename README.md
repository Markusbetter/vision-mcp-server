# Vision MCP Server | 图片分析 MCP

[English](#english) | [中文](#中文)

---

## 中文

一个用于图片分析的 MCP (Model Context Protocol) 服务器，支持图片内容分析和描述。
例如当你在客户端的模型只支持文字输入，这时你可以使用视觉模型mcp来弥补。
这个项目采用了魔搭社区免费的视觉模型Qwen3-VL-30B-A3B-Instruct（你也可以在配置中，使用魔搭社区自行更换为自己想要的视觉模型）。

## 功能特点

- 支持本地图片文件和在线图片 URL
- 基于魔搭社区 AI 模型的智能图像分析
- 完全兼容 MCP 协议
- TypeScript 支持，提供完整的类型定义

## 安装

### 方式一：使用 npx（推荐）

无需预先安装，在客户端填写以下内容npx 会自动下载并运行最新版本：

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "vision-mcp-server"
      ],
      "env": {
        "MODELSCOPE_TOKEN": "your_modelscope_token_here",
        "MODELSCOPE_MODEL": "Qwen/Qwen3-VL-30B-A3B-Instruct"
      }
    }
  }
}
```

### 方式二：全局安装

```bash
npm install -g vision-mcp-server
```

然后在客户端配置中：

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "vision-mcp-server",
      "env": {
        "MODELSCOPE_TOKEN": "your_modelscope_token_here",
        "MODELSCOPE_MODEL": "Qwen/Qwen3-VL-30B-A3B-Instruct"
      }
    }
  }
}
```

### 方式三：本地安装

```bash
npm install vision-mcp-server
```

然后在客户端配置中：

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "node",
      "args": ["node_modules/vision-mcp-server/dist/index.js"],
      "env": {
        "MODELSCOPE_TOKEN": "your_modelscope_token_here",
        "MODELSCOPE_MODEL": "Qwen/Qwen3-VL-30B-A3B-Instruct"
      }
    }
  }
}
```

## 环境变量配置

在使用前，需要设置以下环境变量：

- `MODELSCOPE_TOKEN`: 魔搭社区的 API 密钥（必需）
  - 获取方式：访问 [魔搭社区](https://modelscope.cn) → 个人中心 → API令牌
- `MODELSCOPE_MODEL`: 使用的模型名称（可选，默认为 "Qwen/Qwen3-VL-30B-A3B-Instruct"）
  - 支持其他视觉模型，如：`Qwen/Qwen2-VL-7B-Instruct`

## 使用示例

```javascript
// 分析本地图片
{
  "name": "analyze_image",
  "arguments": {
    "image": "/path/to/your/image.jpg",
    "prompt": "请描述这张图片的内容"
  }
}

// 分析在线图片
{
  "name": "analyze_image",
  "arguments": {
    "image": "https://example.com/image.jpg",
    "prompt": "这张图片中有哪些物体？"
  }
}
```

## API 参考

### analyze_image

分析图片内容并提供详细描述。

**参数**:
- `image` (string): 图片 URL 或本地文件路径
- `prompt` (string, 可选): 对图片的问题或分析要求，默认为 "请描述这张图片的内容"

**返回**:
图片内容的详细文本描述。

## 开发

### 构建

```bash
npm run build
```

### 测试

```bash
npm test
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

[MIT](LICENSE)

## 更新日志

### 1.0.0
- 初始版本发布
- 支持图片分析功能
- 兼容 MCP 协议

---

## English

A Vision Analysis MCP (Model Context Protocol) Server that supports image content analysis and description.

## Features

- Support for local image files and online image URLs
- Intelligent image analysis based on ModelScope AI models
- Full compatibility with MCP protocol
- TypeScript support with complete type definitions

## Installation

### Option 1: Using npx (Recommended)

No need to pre-install, npx will automatically download and run the latest version:

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "vision-mcp-server"
      ],
      "env": {
        "MODELSCOPE_TOKEN": "your_modelscope_token_here",
        "MODELSCOPE_MODEL": "Qwen/Qwen3-VL-30B-A3B-Instruct"
      }
    }
  }
}
```

### Option 2: Global Installation

```bash
npm install -g vision-mcp-server
```

Then in your client configuration:

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "vision-mcp-server",
      "env": {
        "MODELSCOPE_TOKEN": "your_modelscope_token_here",
        "MODELSCOPE_MODEL": "Qwen/Qwen3-VL-30B-A3B-Instruct"
      }
    }
  }
}
```

### Option 3: Local Installation

```bash
npm install vision-mcp-server
```

Then in your client configuration:

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "node",
      "args": ["node_modules/vision-mcp-server/dist/index.js"],
      "env": {
        "MODELSCOPE_TOKEN": "your_modelscope_token_here",
        "MODELSCOPE_MODEL": "Qwen/Qwen3-VL-30B-A3B-Instruct"
      }
    }
  }
}
```

## Environment Variables Configuration

Before using, you need to set the following environment variables:

- `MODELSCOPE_TOKEN`: ModelScope API key (required)
  - Get it from: [ModelScope](https://modelscope.cn) → Profile → API Token
- `MODELSCOPE_MODEL`: Model name to use (optional, default is "Qwen/Qwen3-VL-30B-A3B-Instruct")
  - Supports other vision models, such as: `Qwen/Qwen2-VL-7B-Instruct`

## Usage Examples

```javascript
// Analyze local image
{
  "name": "analyze_image",
  "arguments": {
    "image": "/path/to/your/image.jpg",
    "prompt": "Please describe the content of this image"
  }
}

// Analyze online image
{
  "name": "analyze_image",
  "arguments": {
    "image": "https://example.com/image.jpg",
    "prompt": "What objects are in this image?"
  }
}
```

## API Reference

### analyze_image

Analyze image content and provide detailed description.

**Parameters**:
- `image` (string): Image URL or local file path
- `prompt` (string, optional): Question or analysis requirement for the image, default is "Please describe the content of this image"

**Returns**:
Detailed text description of the image content.

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## Contributing

Issues and Pull Requests are welcome!

## License

[MIT](LICENSE)

## Changelog

### 1.0.0
- Initial release
- Image analysis support
- MCP protocol compatibility
