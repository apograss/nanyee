import type OpenAI from "openai";

// Tool definitions for function calling
export const toolDefinitions: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description: "搜索校园知识库文章。对于用户的任何提问，都应该先调用此工具搜索知识库。搜索时提取用户问题中的核心关键词（2-4个词），不要添加额外修饰词。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_tool",
      description: "推荐校园工具给用户。当用户提到课表、选课、成绩等需求时调用。",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            enum: ["schedule", "grades", "enroll"],
            description: "用户意图：schedule=课表导出, grades=成绩查询, enroll=自动选课",
          },
        },
        required: ["intent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_schedule",
      description: "将课表数据转换为 ICS 日历格式。用户提供课表文本或截图后调用。",
      parameters: {
        type: "object",
        properties: {
          rawText: {
            type: "string",
            description: "课表原始文本内容",
          },
          semester: {
            type: "string",
            description: "学期，如 2025-2026-2",
          },
        },
        required: ["rawText"],
      },
    },
  },
];

export type ToolName = "search_knowledge" | "recommend_tool" | "convert_schedule";
