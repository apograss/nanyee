import { prisma } from "@/lib/prisma";
import type { ToolName } from "@/lib/ai/tools";
import { searchWikiArticles } from "@/lib/wiki/search";

const TOOL_CARDS: Record<string, { title: string; desc: string; icon: string; href: string }> = {
  schedule: {
    title: "课表导出",
    desc: "将教务系统课表转换为 ICS 日历文件",
    icon: "📅",
    href: "/tools/schedule",
  },
  grades: {
    title: "成绩查询",
    desc: "查询各学期成绩和 GPA",
    icon: "📊",
    href: "/tools/grades",
  },
  enroll: {
    title: "自动选课",
    desc: "设定选课任务，系统自动抢课",
    icon: "🎯",
    href: "/tools/enroll",
  },
};

export interface ToolReference {
  title: string;
  source: string;
  url: string;
}

export async function executeTool(
  name: ToolName,
  args: Record<string, unknown>,
  userId?: string
): Promise<{ result: string; toolCard?: typeof TOOL_CARDS[string]; references?: ToolReference[] }> {
  const startMs = Date.now();

  try {
    switch (name) {
      case "search_knowledge": {
        const query = String(args.query || "").trim();
        if (!query) {
          const result = "请提供搜索关键词。";
          await logToolRun(name, args, result, startMs, true, userId);
          return { result };
        }

        const { results: articles } = await searchWikiArticles(query, 5);

        const result =
          articles.length > 0
            ? articles
                .map(
                  (a) => `【${a.title}】${a.summary || ""}\n摘要: ${a.snippet}\n链接: /kb/${a.slug}`
                )
                .join("\n\n")
            : "未找到相关文章。";

        const references: ToolReference[] = articles.map((a) => ({
          title: a.title,
          source: a.summary || a.snippet.slice(0, 80) || "知识库文章",
          url: `/kb/${a.slug}`,
        }));

        await logToolRun(name, args, result, startMs, true, userId);
        return { result, references };
      }

      case "recommend_tool": {
        const intent = String(args.intent || "");
        const card = TOOL_CARDS[intent];

        if (!card) {
          const result = "未找到匹配的工具。";
          await logToolRun(name, args, result, startMs, true, userId);
          return { result };
        }

        const result = `推荐工具: ${card.title} - ${card.desc}`;
        await logToolRun(name, args, result, startMs, true, userId);
        return { result, toolCard: card };
      }

      case "convert_schedule": {
        // Placeholder — actual conversion will use tools/ subsystem
        const result =
          "课表转换功能请直接使用工具页面操作，支持从教务系统导入。";
        await logToolRun(name, args, result, startMs, true, userId);
        return {
          result,
          toolCard: TOOL_CARDS.schedule,
        };
      }

      default: {
        const result = `未知工具: ${name}`;
        await logToolRun(name, args, result, startMs, false, userId, "UNKNOWN_TOOL");
        return { result };
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await logToolRun(name, args, errorMsg, startMs, false, userId, "EXECUTION_ERROR");
    return { result: `知识库搜索暂时不可用，请基于已有知识回答用户问题。错误: ${errorMsg}` };
  }
}

async function logToolRun(
  toolName: string,
  input: Record<string, unknown>,
  output: string,
  startMs: number,
  success: boolean,
  userId?: string,
  errorCode?: string
) {
  await prisma.toolRun.create({
    data: {
      toolName,
      input: JSON.stringify(input),
      output: output.slice(0, 4000),
      latencyMs: Date.now() - startMs,
      success,
      errorCode,
      userId,
    },
  });
}

