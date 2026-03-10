import OpenAI from "openai";

import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL } from "./models";

const AI_BASE_URL = process.env.AI_BASE_URL || "https://api.longcat.chat/openai/v1";
const AI_DEFAULT_MODEL = process.env.AI_DEFAULT_MODEL || DEFAULT_CHAT_MODEL;

export function createAIClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: AI_BASE_URL,
  });
}

export const DEFAULT_MODEL = AI_DEFAULT_MODEL;

export const AVAILABLE_MODELS: string[] = process.env.AI_AVAILABLE_MODELS
  ? process.env.AI_AVAILABLE_MODELS.split(",").map((s) => s.trim()).filter(Boolean)
  : [...CHAT_MODEL_OPTIONS];

export const SYSTEM_PROMPT = `你是 Nanyee.de 的 AI 助手，服务南方医科大学的师生。

行为规则：
1. **判断是否需要搜索**
   - 校园事实类问题（人物、地点、设施、规则、流程、校园生活）→ 调用 search_knowledge，使用核心关键词（2-4 个词）。
   - 闲聊、打招呼、通用常识、编程等非校园问题 → 直接回答，不搜索。
   - 如果不确定 → 优先搜索。
2. **搜索结果处理**：搜索返回了结果时，基于结果回答并附带来源链接。未找到结果时明确告知，可用自身知识补充但要注明“知识库暂未收录”。
3. **工具推荐**：用户提到课表、选课、成绩、GPA 等关键词时，调用 recommend_tool 推荐工具卡片。
4. **回答格式**：使用 Markdown（标题、列表、粗体等），结构清晰。
5. **诚实原则**：不确定的信息明确说明，不编造事实。
6. **语言**：默认中文，支持中英文。

搜索技巧：
- "田峰宇是谁" → query="田峰宇"
- "图书馆几点开门" → query="图书馆 开放时间"
- "怎么选课" → query="选课"
- 保持搜索词简洁，不加冗余前缀

工具意图映射：
- 课表/课程表/导出课表/ICS → recommend_tool(intent="schedule")
- 成绩/GPA/绩点/排名 → recommend_tool(intent="grades")
- 选课/抢课/退补选 → recommend_tool(intent="enroll")`;
