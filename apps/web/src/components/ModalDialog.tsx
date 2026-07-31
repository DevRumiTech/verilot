import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { moveKeyboardPosition } from "../lib/keyboard.js";

function keyboardTargets(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
    ),
  );
}

export function ModalDialog({
  children,
  description,
  onClose,
  title,
}: {
  children: ReactNode;
  description: string;
  onClose(): void;
  title: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const titleId = `dialog-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
  const descriptionId = `${titleId}-description`;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first =
      container.current === null ? null : (keyboardTargets(container.current)[0] ?? null);
    moveKeyboardPosition(first);

    return () => moveKeyboardPosition(previous);
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab" || container.current === null) {
      return;
    }

    const targets = keyboardTargets(container.current);
    const first = targets[0];
    const last = targets.at(-1);

    if (first === undefined || last === undefined) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      moveKeyboardPosition(last);
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      moveKeyboardPosition(first);
    }
  }

  return (
    <div className="dialog-backdrop">
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="surface dialog-panel"
        onKeyDown={handleKeyDown}
        ref={container}
        role="dialog"
      >
        <div className="dialog-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            aria-label="Close dialog"
            className="button button-secondary dialog-close"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <p className="dialog-copy dialog-description" id={descriptionId}>
          {description}
        </p>
        {children}
      </div>
    </div>
  );
}
