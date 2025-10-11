#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { registerImageAnalysisTool } from './image-analysis-service.js';

// 从环境变量获取配置
const MODELSCOPE_TOKEN = process.env.MODELSCOPE_TOKEN;
const MODELSCOPE_MODEL = process.env.MODELSCOPE_MODEL || "Qwen/Qwen3-VL-30B-A3B-Instruct";

// 使用更静默的错误处理，避免干扰MCP通信
if (!MODELSCOPE_TOKEN) {
  // 使用stderr输出错误信息，避免干扰MCP通信
  process.stderr.write("错误：未设置MODELSCOPE_TOKEN环境变量\n");
  process.stderr.write("请在客户端配置中设置环境变量，例如：\n");
  process.stderr.write(JSON.stringify({
    "mcpServers": {
      "vision-mcp-server": {
        "type": "stdio",
        "command": "node",
        "args": ["d:\\code\\vison_mcp\\dist\\index.js"],
        "env": {
          "MODELSCOPE_TOKEN": "your_modelscope_token_here",
          "MODELSCOPE_MODEL": "Qwen/Qwen3-VL-30B-A3B-Instruct"
        }
      }
    }
  }, null, 2) + "\n");
  process.exit(1);
}

// 确保类型安全
const apiKey: string = MODELSCOPE_TOKEN;
const model: string = MODELSCOPE_MODEL;

/**
 * MCP服务器应用程序类
 */
class McpServerApplication {
  private server: Server;

  constructor() {
    this.server = new Server({
      name: "vision-mcp-server",
      version: "1.0.0",
      capabilities: {
        tools: {}
      }
    });
    
    this.setupErrorHandling();
    // 移除console.info日志，避免干扰MCP通信
  }

  /**
   * 注册所有工具
   */
  async registerTools() {
    try {
      // 注册图片分析工具
      registerImageAnalysisTool(this.server, apiKey, model);
      // 移除console.info日志，避免干扰MCP通信
    } catch (error) {
      // 使用stderr输出错误信息，避免干扰MCP通信
      process.stderr.write(`Failed to register tools: ${error instanceof Error ? error.message : String(error)}\n`);
      throw error;
    }
  }

  /**
   * 设置错误处理
   */
  setupErrorHandling() {
    process.on('uncaughtException', (error) => {
      // 使用stderr输出错误信息，避免干扰MCP通信
      process.stderr.write(`Uncaught exception: ${error instanceof Error ? error.message : String(error)}\n`);
      this.gracefulShutdown(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      // 使用stderr输出错误信息，避免干扰MCP通信
      process.stderr.write(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}\n`);
      this.gracefulShutdown(1);
    });

    process.on('SIGINT', () => {
      // 使用stderr输出信息，避免干扰MCP通信
      process.stderr.write("Received SIGINT, shutting down gracefully...\n");
      this.gracefulShutdown(0);
    });

    process.on('SIGTERM', () => {
      // 使用stderr输出信息，避免干扰MCP通信
      process.stderr.write("Received SIGTERM, shutting down gracefully...\n");
      this.gracefulShutdown(0);
    });
  }

  /**
   * 优雅关闭
   */
  gracefulShutdown(exitCode: number) {
    try {
      // 使用stderr输出信息，避免干扰MCP通信
      process.stderr.write("Performing graceful shutdown...\n");
      process.exit(exitCode);
    } catch (error) {
      process.stderr.write(`Error during graceful shutdown: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }
  }

  /**
   * 启动服务器
   */
  async start() {
    try {
      // 移除console.info日志，避免干扰MCP通信
      
      // 注册工具
      await this.registerTools();
      
      // 创建传输层
      const transport = new StdioServerTransport();
      
      // 启动服务器
      await this.server.connect(transport);
      
      // 移除console.info日志，避免干扰MCP通信
    } catch (error) {
      // 使用stderr输出错误信息，避免干扰MCP通信
      process.stderr.write(`Server startup failed: ${error instanceof Error ? error.message : String(error)}\n`);
      throw error;
    }
  }
}

// 启动应用程序
async function main() {
  try {
    const app = new McpServerApplication();
    await app.start();
  } catch (error) {
    // 使用stderr输出错误信息，避免干扰MCP通信
    process.stderr.write(`Application startup failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

// 启动主程序
main();
