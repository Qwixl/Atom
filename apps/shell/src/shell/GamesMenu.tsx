import { useEffect, useId, useRef, useState } from "react";
import { IconGames } from "./ShellIcons.js";

export type GamesMenuItem = {
  moduleId: string;
  label: string;
};

type GamesMenuProps = {
  games: readonly GamesMenuItem[];
  onSelect: (moduleId: string) => void;
  disabled?: boolean;
  className?: string;
};

export function GamesMenu({ games, onSelect, disabled, className }: GamesMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) return;
      root.open = false;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const root = rootRef.current;
      if (!root) return;
      root.open = false;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <details
      ref={rootRef}
      className={`atom-games-menu${className ? ` ${className}` : ""}`}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary
        className="btn btn-ghost atom-app-games-trigger panel-btn-icon atom-nav-item"
        aria-label="Games"
        title="Games"
        aria-controls={menuId}
        aria-disabled={disabled || games.length === 0}
        onClick={(event) => {
          if (disabled || games.length === 0) {
            event.preventDefault();
          }
        }}
      >
        <IconGames className="atom-nav-icon atom-games-icon" />
        <span className="atom-nav-label">Games</span>
      </summary>
      <div id={menuId} className="atom-games-menu-panel" role="menu">
        {games.length === 0 ? (
          <p className="atom-games-menu-empty">No games loaded</p>
        ) : (
          games.map((game) => (
            <button
              key={game.moduleId}
              type="button"
              role="menuitem"
              className="atom-games-menu-item"
              onClick={() => {
                const root = rootRef.current;
                if (root) root.open = false;
                setOpen(false);
                onSelect(game.moduleId);
              }}
            >
              {game.label}
            </button>
          ))
        )}
      </div>
    </details>
  );
}
