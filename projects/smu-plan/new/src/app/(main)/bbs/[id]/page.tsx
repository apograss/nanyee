"use client";

import { useEffect } from "react";

const FORUM_URL = "https://chat.nanyee.de";

export default function BBSTopicPage() {
  useEffect(() => {
    window.location.href = FORUM_URL;
  }, []);

  return (
    <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
      <p>论坛已迁移，正在跳转到 <a href={FORUM_URL}>chat.nanyee.de</a>...</p>
    </div>
  );
}
