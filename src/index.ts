#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, publicConfigSummary } from './config.js';
import { registerImageAnalysisTool } from './image-analysis-service.js';
import { errorMessage } from './errors.js';

class McpServerApplication {
  private readonly server: McpServer;

  constructor() {
    this.server = new McpServer(
      { name: 'vision-mcp-server', version: '1.1.0' },
      {
        instructions: '使用 analyze_image 分析本地图片、在线图片或 image data URL。服务器会按配置顺序调用视觉模型，并仅在限流、超时、网络错误或服务端故障时切换备用模型。',
      },
    );
  }

  async start(): Promise<void> {
    const config = loadConfig();
    if (config.debug) {
      process.stderr.write(`[vision-mcp] config=${JSON.stringify(publicConfigSummary(config))}\n`);
    }
    registerImageAnalysisTool(this.server, config);
    await this.server.connect(new StdioServerTransport());
  }
}

async function main(): Promise<void> {
  const app = new McpServerApplication();
  await app.start();
}

main().catch((error) => {
  process.stderr.write(`Vision MCP 启动失败: ${errorMessage(error)}\n`);
  process.exit(1);
});
