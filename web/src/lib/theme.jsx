// 主题系统：暖色浅色 / 暖墨暗色，localStorage 持久化，默认跟随系统
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/components/ui.jsx";

const STORAGE_KEY = "nanyee-theme";
const ThemeContext = createContext({ theme: "light", toggle: () => {} });

function initialTheme() {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/* 主题切换按钮：Sun/Moon 弹簧旋转切换 */
export function ThemeToggle({ className }) {
  const { theme, toggle } = useTheme();
  const reduceMotion = useReducedMotion();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "切换到浅色模式" : "切换到暗色模式"}
      title={dark ? "切换到浅色模式" : "切换到暗色模式"}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-border bg-card text-foreground transition-colors hover:bg-[var(--seed-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className
      )}
      data-component="ThemeToggle"
    >
      <motion.span
        key={theme}
        initial={reduceMotion ? false : { rotate: -60, opacity: 0, scale: 0.7 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
        className="inline-flex"
      >
        {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </motion.span>
    </button>
  );
}
