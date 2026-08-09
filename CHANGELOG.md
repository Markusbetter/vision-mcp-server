# Changelog

## 1.1.0

- 按 MCP TypeScript SDK 官方推荐迁移到 `McpServer.registerTool`
- 支持通用 OpenAI Chat Completions 兼容视觉接口
- 支持按顺序配置多个模型和多个供应商
- 支持智谱任意视觉模型 ID，不再写死免费模型列表
- 在限流、超时、网络错误和服务端故障时自动 fallback
- 为失败路由增加冷却，避免重复撞限流
- 自动校验、旋转和等比例缩放图片，解决超过 2048×2048 的兼容问题
- 增加本地路径限制、真实格式校验、下载限制和 SSRF 防护
- 保留原有 `MODELSCOPE_TOKEN`、`MODELSCOPE_MODEL` 配置兼容
- 增加单元测试、模拟接口测试和安全实时测试脚本

## 1.0.0

- 初始版本
- 支持本地图片和在线图片分析
- 支持魔搭视觉模型
