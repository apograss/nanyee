import styles from "./Badge.module.css";

interface BadgeProps {
  text: string;
  colorVariant?: "brand" | "mint" | "dark" | "success" | "warning" | "error";
}

export default function Badge({ text, colorVariant = "dark" }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[colorVariant]}`}>{text}</span>
  );
}
