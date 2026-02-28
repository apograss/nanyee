import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const passwordHash = await hash("admin123", 12);
  const user = await prisma.user.create({
    data: {
      username: "admin",
      passwordHash,
      nickname: "Admin",
      role: "admin",
      status: "active",
    },
  });
  console.log("Created admin user:", user.id);

  // Create quiz questions
  await prisma.quizQuestion.createMany({
    data: [
      {
        question: "南方医科大学位于哪个城市?",
        options: JSON.stringify(["北京", "上海", "广州", "深圳"]),
        answer: 2,
      },
      {
        question: "南方医科大学前身是?",
        options: JSON.stringify([
          "南京军区军医学校",
          "中国人民解放军第一军医大学",
          "广州军区军医学校",
          "第四军医大学",
        ]),
        answer: 1,
      },
      {
        question: "南方医科大学校训是?",
        options: JSON.stringify(["博学笃行", "德术并举", "求真务实", "厚德载物"]),
        answer: 0,
      },
      {
        question: "南方医科大学主校区在哪个区?",
        options: JSON.stringify(["天河区", "白云区", "番禺区", "海珠区"]),
        answer: 1,
      },
    ],
  });
  console.log("Created 4 quiz questions");

  // Create a sample article
  const article = await prisma.article.create({
    data: {
      title: "新生校园指南：南方医科大学入学必看",
      slug: "freshman-guide",
      content:
        "# 新生校园指南\n\n欢迎来到南方医科大学！本文将带你了解校园生活的方方面面。\n\n## 校园交通\n\n学校提供校园巴士，覆盖主要教学楼和宿舍区。\n\n## 食堂推荐\n\n- 一饭堂：品种丰富\n- 二饭堂：性价比高\n- 三饭堂：环境最好\n\n## 图书馆\n\n开放时间：7:00 - 22:00，考试周延长至 23:00。",
      summary: "南方医科大学新生入学必看指南，涵盖交通、食堂、图书馆等信息。",
      category: "校园生活",
      tags: JSON.stringify(["新生", "指南", "校园生活"]),
      authorId: user.id,
      status: "published",
      publishedAt: new Date(),
    },
  });
  console.log("Created sample article:", article.slug);

  await prisma.$disconnect();
}

main().catch(console.error);
