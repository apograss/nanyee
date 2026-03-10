"use client";

import React, { useState } from "react";
import styles from "./Avatar.module.css";

export interface AvatarProps {
  src?: string | null;
  fallback: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
}

export default function Avatar({
  src,
  fallback,
  size = "md",
  className,
  onClick,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initial = (fallback || "?").charAt(0).toUpperCase();

  const showImage = src && !imgError;

  return (
    <div
      className={`${styles.root} ${styles[size]} ${onClick ? styles.clickable : ""} ${className || ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      {showImage ? (
        <img
          src={src}
          alt={fallback}
          className={styles.image}
          onError={() => setImgError(true)}
        />
      ) : (
        <span className={styles.initial}>{initial}</span>
      )}
    </div>
  );
}
