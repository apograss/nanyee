import styles from "./NeoSteps.module.css";

interface Step {
  id: string;
  label: string;
}

interface NeoStepsProps {
  steps: Step[];
  currentStepIndex: number;
  className?: string;
}

export default function NeoSteps({ steps, currentStepIndex, className }: NeoStepsProps) {
  return (
    <div className={`${styles.wrap} ${className || ""}`}>
      {steps.map((step, i) => (
        <div
          key={step.id}
          className={`${styles.step} ${
            i < currentStepIndex
              ? styles.done
              : i === currentStepIndex
                ? styles.active
                : styles.pending
          }`}
        >
          <div className={styles.indicator}>
            {i < currentStepIndex ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7L5.5 10.5L12 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <span>{i + 1}</span>
            )}
          </div>
          <span className={styles.label}>{step.label}</span>
          {i < steps.length - 1 && <div className={styles.connector} />}
        </div>
      ))}
    </div>
  );
}
