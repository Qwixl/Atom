import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  LINK_INTENT_LABELS,
  type LinkIntentKind,
  type LinkIntentPayload,
} from "./linkIntent.js";

function LinkToolMenu({
  id,
  menuRef,
  position,
  onPick,
}: {
  id: string;
  menuRef: React.RefObject<HTMLSpanElement | null>;
  position: { top: number; left: number };
  onPick: (intent: LinkIntentKind) => void;
}) {
  return (
    <span
      ref={menuRef}
      className="atom-link-tool-menu atom-link-tool-menu--portal"
      id={id}
      role="menu"
      aria-label="Link actions"
      style={{ top: position.top, left: position.left }}
    >
      {(Object.keys(LINK_INTENT_LABELS) as LinkIntentKind[]).map((intent) => (
        <button
          key={intent}
          type="button"
          role="menuitem"
          className="atom-link-tool-menu-item"
          onClick={() => onPick(intent)}
        >
          {LINK_INTENT_LABELS[intent]}
        </button>
      ))}
    </span>
  );
}

export function AtomContentLink({
  href,
  children,
  onIntent,
}: {
  href: string;
  children: React.ReactNode;
  onIntent: (payload: LinkIntentPayload) => void;
}) {
  const menuId = useId();
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function pick(intent: LinkIntentKind) {
    const title = typeof children === "string" ? children.trim() : href;
    onIntent({ url: href, title, intent });
    setOpen(false);
  }

  return (
    <>
      <a
        ref={anchorRef}
        href={href}
        className="atom-content-link"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
      >
        {children}
      </a>
      {open
        ? createPortal(
            <LinkToolMenu id={menuId} menuRef={menuRef} position={position} onPick={pick} />,
            document.body,
          )
        : null}
    </>
  );
}
