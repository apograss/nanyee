import ToolCard from "@/components/molecules/ToolCard";
import styles from "./ToolGrid.module.css";

interface Tool {
  title: string;
  desc: string;
  icon: React.ReactNode;
  href: string;
  tag?: string;
}

interface ToolGridProps {
  tools: Tool[];
}

export default function ToolGrid({ tools }: ToolGridProps) {
  return (
    <div className={styles.grid}>
      {tools.map((tool) => (
        <ToolCard key={tool.href} {...tool} />
      ))}
    </div>
  );
}
