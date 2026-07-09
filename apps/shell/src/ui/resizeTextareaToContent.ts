const DEFAULT_MAX_LINES = 6;

/** Grow a textarea with its content up to `maxLines`, then scroll. */
export function resizeTextareaToContent(el: HTMLTextAreaElement, maxLines = DEFAULT_MAX_LINES) {
  el.style.height = "auto";
  const styles = getComputedStyle(el);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 22;
  const padY =
    (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
  const maxHeight = lineHeight * maxLines + padY;
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
}
