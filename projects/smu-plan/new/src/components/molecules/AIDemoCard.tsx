"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AIDemoCard.module.css";

const DEMO_CONVERSATIONS = [
  {
    q: "图书馆晚上几点关门？周末呢？",
    a: "顺德校区图书馆：\n• 周一至周五：7:30 - 22:30\n• 周六日：8:30 - 22:00\n• 考试周延长至 23:00",
    source: "校园生活指南",
  },
  {
    q: "二饭堂几点开门？",
    a: "第二饭堂工作日 6:30–21:00，周末 7:00–20:30。早餐推荐尝试石锅粥和肠粉 🍜",
    source: "校园生活指南",
  },
  {
    q: "大一能参加几个社团？",
    a: "没有数量限制，但建议精选 2-3 个。校级社团在百团大战期间摆摊招新，院级社团关注学院公众号 🎪",
    source: "新生指南",
  },
];

export default function AIDemoCard() {
  const [convIdx, setConvIdx] = useState(0);
  const [displayQ, setDisplayQ] = useState("");
  const [displayA, setDisplayA] = useState("");
  const [phase, setPhase] = useState<"typing-q" | "typing-a" | "done">("typing-q");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const conv = DEMO_CONVERSATIONS[convIdx];

  useEffect(() => {
    let charIdx = 0;

    const typeNext = () => {
      if (phase === "typing-q") {
        if (charIdx <= conv.q.length) {
          setDisplayQ(conv.q.slice(0, charIdx));
          charIdx++;
          timerRef.current = setTimeout(typeNext, 40 + Math.random() * 30);
        } else {
          setPhase("typing-a");
          charIdx = 0;
          timerRef.current = setTimeout(typeNext, 400);
        }
      } else if (phase === "typing-a") {
        if (charIdx <= conv.a.length) {
          setDisplayA(conv.a.slice(0, charIdx));
          charIdx++;
          timerRef.current = setTimeout(typeNext, 20 + Math.random() * 20);
        } else {
          setPhase("done");
          timerRef.current = setTimeout(() => {
            setConvIdx((i) => (i + 1) % DEMO_CONVERSATIONS.length);
            setDisplayQ("");
            setDisplayA("");
            setPhase("typing-q");
          }, 3000);
        }
      }
    };

    timerRef.current = setTimeout(typeNext, phase === "typing-q" && charIdx === 0 ? 600 : 0);
    return () => clearTimeout(timerRef.current);
  }, [phase, convIdx, conv]);

  return (
    <div className={styles.card}>
      <div className={styles.bar}>
        <div className={styles.dots}>
          <span className={styles.dotRed} />
          <span className={styles.dotYellow} />
          <span className={styles.dotGreen} />
        </div>
        <span className={styles.title}>AI 对话演示</span>
      </div>
      <div className={styles.body}>
        {displayQ ? (
          <div className={styles.question}>
            <div className={styles.avatarUser}>你</div>
            <div className={styles.bubbleUser}>
              {displayQ}
              {phase === "typing-q" && <span className={styles.cursor}>|</span>}
            </div>
          </div>
        ) : null}

        {displayA ? (
          <div className={styles.answer}>
            <div className={styles.avatarAi}>AI</div>
            <div className={styles.bubbleAi}>
              {displayA}
              {phase === "typing-a" && <span className={styles.cursor}>|</span>}
              {phase === "done" && (
                <div className={styles.source}>📚 引用自 · {conv.source}</div>
              )}
              {phase === "typing-a" && (
                <div className={styles.typingDots}>
                  <span /><span /><span />
                </div>
              )}
            </div>
          </div>
        ) : null}

        {!displayQ && !displayA && (
          <div className={styles.placeholder}>
            <div className={styles.typingDots}>
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
