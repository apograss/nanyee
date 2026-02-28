import OpenAI from "openai";

const AI_BASE_URL = process.env.AI_BASE_URL || "https://api.longcat.chat/openai/v1";
const AI_DEFAULT_MODEL = process.env.AI_DEFAULT_MODEL || "LongCat-Flash-Chat";

export function createAIClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: AI_BASE_URL,
  });
}

export const DEFAULT_MODEL = AI_DEFAULT_MODEL;

export const AVAILABLE_MODELS = [
  "LongCat-Flash-Chat",
  "LongCat-Flash-Thinking",
  "LongCat-Flash-Thinking-2601",
  "LongCat-Flash-Lite",
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number];

export const SYSTEM_PROMPT = `你是 Nanyee.de 的 AI 助手，服务南方医科大学的师生。你擅长回答关于校园生活、学业、工具使用等问题。

核心规则（按优先级排序）：
1. **工具调用优先**：当用户提到课表、选课、成绩、排课、抢课、GPA 等关键词时，必须先调用 recommend_tool 推荐对应工具卡片，然后再给出文字回答。这是最重要的规则。
2. **知识库搜索**：对于校规、流程、指南等问题，调用 search_knowledge 搜索知识库获取实时数据，引用时附带来源。
3. **回答质量**：使用 Markdown 格式输出（标题、列表、代码块、粗体等），让回答结构清晰。
4. **诚实原则**：不确定的信息要明确说明，不要编造事实。
5. **语言**：默认中文回复，支持中英文。

工具意图映射：
- 课表/课程表/导出课表/WakeUp/ICS → recommend_tool(intent="schedule")
- 成绩/GPA/绩点/排名/挂科 → recommend_tool(intent="grades")
- 选课/抢课/秒杀课程/退补选 → recommend_tool(intent="enroll")`;
