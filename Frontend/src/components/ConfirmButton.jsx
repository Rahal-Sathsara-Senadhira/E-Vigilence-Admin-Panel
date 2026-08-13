import React from "react";

// A button that requires two clicks: the first "arms" it (swapping to a
// confirm label for a few seconds), the second actually fires onConfirm.
// Avoids native confirm()/alert() dialogs, which break the app's dark theme.
export default function ConfirmButton({
  onConfirm,
  disabled,
  armedMs = 4000,
  className = "",
  armedClassName = "",
  children,
  confirmChildren = "Confirm?",
}) {
  const [armed, setArmed] = React.useState(false);
  const timerRef = React.useRef(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleClick() {
    if (!armed) {
      setArmed(true);
      timerRef.current = setTimeout(() => setArmed(false), armedMs);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    setArmed(false);
    onConfirm();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={armed ? armedClassName || className : className}
    >
      {armed ? confirmChildren : children}
    </button>
  );
}
