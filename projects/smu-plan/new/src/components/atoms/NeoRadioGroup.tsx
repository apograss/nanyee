import styles from "./NeoRadioGroup.module.css";

interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface NeoRadioGroupProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  layout?: "horizontal" | "vertical";
  className?: string;
}

export default function NeoRadioGroup({
  name,
  value,
  onChange,
  options,
  layout = "vertical",
  className,
}: NeoRadioGroupProps) {
  return (
    <div className={`${styles.group} ${styles[layout]} ${className || ""}`}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`${styles.option} ${value === opt.value ? styles.selected : ""}`}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className={styles.input}
          />
          <div className={styles.indicator}>
            <div className={styles.dot} />
          </div>
          <div className={styles.content}>
            <span className={styles.label}>{opt.label}</span>
            {opt.description && (
              <span className={styles.desc}>{opt.description}</span>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}
