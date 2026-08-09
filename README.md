# Vision MCP Server｜视觉分析 MCP 服务器

[中文](#中文) · [English](#english)

## 中文

这是一个通过视觉模型分析图片的本地 MCP Server。

例如当你在客户端使用的主模型只支持文字输入时，可以把本 MCP 添加到 Agent 工具中，由 `analyze_image` 工具调用独立的视觉模型完成图片理解。

v1.1 支持：

- 魔搭 ModelScope、智谱 BigModel，以及其他 OpenAI Chat Completions 兼容视觉接口
- 同一 API Key 下配置多个模型，并按顺序 fallback
- 跨供应商 fallback
- 自动旋转、格式校验和等比例缩放图片，默认最长边 2048
- 本地目录限制、下载限制、日志脱敏和在线图片 SSRF 防护

## 配置应该写在哪里？

将模型地址、模型 ID 和 API Key 写入客户端或 Agent 的 MCP 配置：

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "npx",
      "args": ["-y", "vision-mcp-server"],
      "env": {
        "配置项": "配置值"
      }
    }
  }
}
```

请妥善保管 API Key，不要把包含真实 Key 的 MCP 配置公开或提交到代码仓库。

下面四种配置方式选择一种即可。

## 方式一：魔搭，一个 Key 配置多个模型

适合只使用魔搭 API-Inference 的用户。

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "npx",
      "args": ["-y", "vision-mcp-server"],
      "env": {
        "MODELSCOPE_TOKEN": "your_modelscope_token",
        "MODELSCOPE_MODELS": "Qwen/Qwen3-VL-30B-A3B-Instruct,Qwen/Qwen2.5-VL-72B-Instruct"
      }
    }
  }
}
```

`MODELSCOPE_MODELS` 是使用英文逗号分隔的有序列表：

1. 首先调用 `Qwen/Qwen3-VL-30B-A3B-Instruct`。
2. 如果它返回限流、超时或服务端故障，则调用后面的模型。
3. 所有模型共用同一个 `MODELSCOPE_TOKEN`。

请确认所填写模型当前支持魔搭 API-Inference 和图片输入。魔搭的可用模型会变化，本项目不会限制具体 Model ID。

旧版单模型配置仍然兼容：

```json
{
  "MODELSCOPE_TOKEN": "your_modelscope_token",
  "MODELSCOPE_MODEL": "Qwen/Qwen3-VL-30B-A3B-Instruct"
}
```

如果同时设置 `MODELSCOPE_MODELS` 和 `MODELSCOPE_MODEL`，优先使用 `MODELSCOPE_MODELS`。

## 方式二：智谱，一个 Key 配置任意视觉模型

智谱模式不会写死模型。用户必须通过 `VISION_MODELS` 明确填写自己有权限使用的视觉模型：

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "npx",
      "args": ["-y", "vision-mcp-server"],
      "env": {
        "VISION_PROVIDER": "zhipu",
        "ZAI_API_KEY": "your_zhipu_api_key",
        "VISION_MODELS": "glm-5v-turbo,glm-4.6v,glm-4.6v-flash,glm-4v-flash"
      }
    }
  }
}
```

可以混合配置付费和免费视觉模型，例如：

- `glm-5v-turbo`：付费视觉模型
- `glm-4.6v`：付费视觉模型
- `glm-4.1v-thinking-flashx`：增强型视觉模型，是否可用取决于账号权限
- `glm-4.6v-flash`：免费视觉模型
- `glm-4.1v-thinking-flash`：免费视觉模型
- `glm-4v-flash`：免费基础图片理解模型

实际可用模型、价格和权限以[智谱官方模型列表](https://docs.bigmodel.cn/cn/guide/start/model-overview)为准。

注意：我们在 2026-08-09 的真实联调中，多次遇到 `glm-4.6v-flash` 返回 HTTP 429、业务码 `1305`（模型当前访问量过大），而 `glm-4v-flash` 可正常调用。这属于智谱免费共享服务的临时过载，不是本 MCP 的图片格式错误。建议配置多个模型，或将有稳定额度的付费视觉模型放在前面。

## 方式三：一个通用 OpenAI 兼容接口，配置多个模型

适合 OpenRouter、硅基流动、自建 vLLM/LM Studio 或其他兼容接口。接口必须支持：

- `POST {baseUrl}/chat/completions`
- OpenAI 风格的 `messages[].content[]`
- `image_url.url` 中的 base64 data URL

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "npx",
      "args": ["-y", "vision-mcp-server"],
      "env": {
        "VISION_PROVIDER": "openai-compatible",
        "OPENAI_BASE_URL": "https://provider.example/v1",
        "OPENAI_API_KEY": "your_api_key",
        "VISION_MODELS": "vision-model-a,vision-model-b,vision-model-c"
      }
    }
  }
}
```

三个模型共用 `OPENAI_API_KEY`，并按照 `VISION_MODELS` 中的顺序 fallback。

“OpenAI 兼容”不代表第三方一定支持图片。若某接口只兼容文本或不接受 base64 图片，本 MCP 无法使其获得视觉能力。

## 方式四：同时配置魔搭、智谱和其他供应商

需要跨供应商 fallback 时，使用 `VISION_ROUTES`。Key 仍然分别放在 `env` 中；`VISION_ROUTES` 只通过 `apiKeyEnv` 引用 Key 所在的环境变量名。

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "npx",
      "args": ["-y", "vision-mcp-server"],
      "env": {
        "MODELSCOPE_TOKEN": "your_modelscope_token",
        "ZAI_API_KEY": "your_zhipu_api_key",
        "CUSTOM_OPENAI_API_KEY": "your_custom_api_key",
        "VISION_ROUTES": "[{\"name\":\"modelscope\",\"baseUrl\":\"https://api-inference.modelscope.cn/v1\",\"apiKeyEnv\":\"MODELSCOPE_TOKEN\",\"models\":[\"Qwen/Qwen3-VL-30B-A3B-Instruct\",\"Qwen/Qwen2.5-VL-72B-Instruct\"],\"maxImageEdge\":2048},{\"name\":\"zhipu\",\"baseUrl\":\"https://open.bigmodel.cn/api/paas/v4\",\"apiKeyEnv\":\"ZAI_API_KEY\",\"models\":[\"glm-5v-turbo\",\"glm-4.6v\",\"glm-4.6v-flash\",\"glm-4v-flash\"],\"maxImageEdge\":2048},{\"name\":\"custom-openai\",\"baseUrl\":\"https://provider.example/v1\",\"apiKeyEnv\":\"CUSTOM_OPENAI_API_KEY\",\"models\":[\"your-vision-model\"],\"maxImageEdge\":2048}]"
      }
    }
  }
}
```

上例的完整调用顺序为：

1. 魔搭第一个模型
2. 魔搭第二个模型（同一个魔搭 Key）
3. 智谱第一个模型
4. 智谱后续模型（同一个智谱 Key）
5. 自定义兼容接口模型

`VISION_ROUTES` 一旦设置，就会覆盖前三种简化配置。

### VISION_ROUTES 字段

| 字段 | 必填 | 说明 |
|---|---:|---|
| `name` | 否 | 路由名称，只用于安全日志和测试筛选 |
| `baseUrl` | 是 | OpenAI 兼容接口基础地址 |
| `apiKeyEnv` | 是 | API Key 所在的环境变量名，不是 Key 本身 |
| `model` | 二选一 | 单个模型 ID |
| `models` | 二选一 | 有序模型 ID 数组，同一路由共用一个 Key |
| `headers` | 否 | 额外请求头；不要在这里存 API Key |
| `timeoutMs` | 否 | 该路由请求超时，单位毫秒 |
| `maxImageEdge` | 否 | 该路由接受的图片最长边 |
| `extraBody` | 否 | 供应商特有的请求字段，例如智谱 `thinking` |

智谱开启思考模式的路由字段示例：

```json
{
  "extraBody": {
    "thinking": { "type": "enabled" }
  }
}
```

## fallback 什么时候发生？

会切换到下一模型：

- HTTP `408`、`429`、`500`、`502`、`503`、`504`
- 请求超时、连接重置、DNS 或其他网络连接错误

不会切换：

- HTTP `400`：图片、Prompt 或请求参数错误
- HTTP `401/403`：Key、权限或模型授权错误
- 内容安全拒绝
- 本地图片不存在、格式无效或路径不允许

失败模型会进入冷却，默认 60 秒。这样可避免每次工具调用都先撞一次已经限流的模型。

## 配置参数总表

### 供应商和模型

| 环境变量 | 使用场景 | 说明 |
|---|---|---|
| `MODELSCOPE_TOKEN` | 魔搭 | 魔搭 API Token |
| `MODELSCOPE_MODEL` | 魔搭旧版单模型 | 单个模型 ID |
| `MODELSCOPE_MODELS` | 魔搭多模型 | 英文逗号分隔，优先于 `MODELSCOPE_MODEL` |
| `VISION_PROVIDER` | 简化配置 | `zhipu` 或 `openai-compatible`；不设置时默认魔搭兼容模式 |
| `ZAI_API_KEY` | 智谱 | 智谱 API Key |
| `OPENAI_BASE_URL` | 通用兼容接口 | 基础地址，例如 `https://provider.example/v1` |
| `OPENAI_API_KEY` | 通用兼容接口 | API Key |
| `VISION_API_KEY_ENV` | 简化配置高级选项 | 改用指定名称的 Key 环境变量 |
| `VISION_MODELS` | 智谱/通用兼容接口 | 必填；英文逗号分隔的有序模型列表 |
| `VISION_ROUTES` | 多供应商 | 高级路由 JSON；设置后覆盖简化配置 |

### 图片、安全和可靠性

| 环境变量 | 默认值 | 说明 |
|---|---:|---|
| `VISION_MAX_IMAGE_EDGE` | `2048` | 简化配置的默认最长边 |
| `VISION_MAX_IMAGE_BYTES` | `20971520` | 输入或处理后图片最大字节数 |
| `VISION_MAX_IMAGE_PIXELS` | `40000000` | 解码图片最大像素数 |
| `VISION_ALLOWED_DIRS` | 未限制 | 允许读取的本地目录，多个目录用英文逗号分隔 |
| `VISION_IMAGE_DOWNLOAD_TIMEOUT_MS` | `15000` | 在线图片下载超时 |
| `VISION_REQUEST_TIMEOUT_MS` | `60000` | 模型请求超时 |
| `VISION_FALLBACK_COOLDOWN_MS` | `60000` | 失败路由冷却时间 |
| `VISION_DEBUG` | `false` | 输出脱敏调试日志到 stderr |

推荐为本地图片配置允许目录：

```json
{
  "VISION_ALLOWED_DIRS": "D:\\Pictures,D:\\Screenshots"
}
```

## MCP 工具

### `analyze_image`

| 参数 | 必填 | 说明 |
|---|---:|---|
| `image` | 是 | 本地绝对路径、HTTP/HTTPS URL 或 image data URL |
| `prompt` | 否 | 针对图片的问题，默认“请描述这张图片的内容” |

示例：

```json
{
  "name": "analyze_image",
  "arguments": {
    "image": "D:\\Pictures\\chart.png",
    "prompt": "提取图表中的标题、数据和单位"
  }
}
```

## 图片处理

在发送给供应商之前，本 MCP 会：

1. 校验真实文件内容，仅接受 JPEG、PNG、WebP、GIF。
2. 应用 EXIF 方向。
3. 按所有候选路由中最小的 `maxImageEdge` 等比例缩放，不放大小图。
4. 有透明通道时输出 PNG，否则输出 JPEG。
5. 清除 EXIF 等元数据。
6. 将图片作为 base64 data URL 发送给视觉接口。

在线图片会先安全下载并做同样处理；localhost、内网地址和云元数据地址默认禁止访问。

## 安装要求

- Node.js `20.9.0` 或更高版本
- MCP 客户端支持本地 stdio Server

使用 npx 无需提前全局安装：

```text
npx -y vision-mcp-server
```

## 开发

```powershell
npm install
npm test
npm run build
```

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## English

Vision MCP Server adds image understanding to MCP agents by calling a separately configured vision model.

For a local stdio installation, put provider credentials and model IDs in the MCP host configuration under `mcpServers.<name>.env`. Models in the same comma-separated `VISION_MODELS`/`MODELSCOPE_MODELS` list share one API key and are tried in order. Use `VISION_ROUTES` for ordered fallback across multiple providers.

Supported configurations:

- ModelScope: `MODELSCOPE_TOKEN` + `MODELSCOPE_MODELS`
- Zhipu: `VISION_PROVIDER=zhipu` + `ZAI_API_KEY` + explicit `VISION_MODELS`
- Generic OpenAI-compatible endpoint: `VISION_PROVIDER=openai-compatible` + `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `VISION_MODELS`
- Multiple providers: `VISION_ROUTES`

Zhipu models are not hardcoded. Free and paid vision model IDs can be mixed in any order. See the complete configuration examples above.

The server falls back only for rate limits, timeouts, network failures, and selected 5xx responses. Invalid images, authentication failures, and request validation errors do not trigger fallback.

License: [MIT](LICENSE)
