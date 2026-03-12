import type { CSSProperties } from "react";

import styles from "./SkeletonBlock.module.css";

interface SkeletonBlockProps {
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
}

export default function SkeletonBlock({
  width,
  height,
  radius,
  className = "",
}: SkeletonBlockProps) {
  return (
    <div
      className={`${styles.skeleton} ${className}`.trim()}
      style={
        {
          ...(width ? { "--skeleton-width": width } : {}),
          ...(height ? { "--skeleton-height": height } : {}),
          ...(radius ? { "--skeleton-radius": radius } : {}),
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}
