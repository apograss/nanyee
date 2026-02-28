import { forwardRef } from "react";
import styles from "./NeoInput.module.css";

interface NeoInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const NeoInput = forwardRef<HTMLInputElement, NeoInputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className={`${styles.wrap} ${className || ""}`}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`${styles.input} ${error ? styles.inputError : ""}`}
          {...props}
        />
        {error && <p className={styles.error}>{error}</p>}
      </div>
    );
  }
);

NeoInput.displayName = "NeoInput";
export default NeoInput;
