import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { EMOJI_GROUPS } from "./emojiData.js";
import { CURATED_GIFS, searchGifs, type GifItem } from "./gifLibrary.js";

type ComposeExtrasProps = {
  onInsertEmoji: (emoji: string) => void;
  onPickGif?: (gif: GifItem) => void;
  disabled?: boolean;
  /** When false, only the emoji button is shown. */
  enableGif?: boolean;
};

type PanelPlacement = {
  left: number;
  bottom: number;
  maxHeight: number;
  width: number;
};

const PANEL_GAP = 8;
const VIEWPORT_PAD = 8;
const PREFERRED_HEIGHT = 280;
const PREFERRED_WIDTH = 320;

function placePanel(anchor: DOMRect): PanelPlacement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(PREFERRED_WIDTH, vw - VIEWPORT_PAD * 2);
  const spaceAbove = Math.max(0, anchor.top - VIEWPORT_PAD - PANEL_GAP);
  const spaceBelow = Math.max(0, vh - anchor.bottom - VIEWPORT_PAD - PANEL_GAP);
  const preferAbove = spaceAbove >= Math.min(PREFERRED_HEIGHT, 160) || spaceAbove >= spaceBelow;
  const available = preferAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(120, Math.min(PREFERRED_HEIGHT, available));
  const left = Math.min(
    Math.max(VIEWPORT_PAD, anchor.left),
    Math.max(VIEWPORT_PAD, vw - width - VIEWPORT_PAD),
  );
  const bottom = preferAbove
    ? Math.max(VIEWPORT_PAD, vh - anchor.top + PANEL_GAP)
    : Math.max(VIEWPORT_PAD, vh - anchor.bottom - PANEL_GAP - maxHeight);
  return { left, bottom, maxHeight, width };
}

export function ComposeExtras({
  onInsertEmoji,
  onPickGif,
  disabled,
  enableGif = false,
}: ComposeExtrasProps) {
  const [panel, setPanel] = useState<"emoji" | "gif" | null>(null);
  const [emojiGroup, setEmojiGroup] = useState(EMOJI_GROUPS[0]!.id);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<GifItem[]>(CURATED_GIFS);
  const [gifBusy, setGifBusy] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useLayoutEffect(() => {
    if (!panel || !rootRef.current) {
      setPlacement(null);
      return;
    }
    function update() {
      const anchor = rootRef.current?.getBoundingClientRect();
      if (!anchor) return;
      setPlacement(placePanel(anchor));
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [panel]);

  useEffect(() => {
    if (!panel) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) {
        setPanel(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [panel]);

  useEffect(() => {
    if (panel !== "gif") return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setGifBusy(true);
      setGifError(null);
      void searchGifs(gifQuery)
        .then((items) => {
          if (!cancelled) setGifs(items.length ? items : CURATED_GIFS);
        })
        .catch((error) => {
          if (!cancelled) {
            setGifError(error instanceof Error ? error.message : String(error));
            setGifs(CURATED_GIFS);
          }
        })
        .finally(() => {
          if (!cancelled) setGifBusy(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [panel, gifQuery]);

  const activeGroup = EMOJI_GROUPS.find((g) => g.id === emojiGroup) ?? EMOJI_GROUPS[0]!;
  const panelStyle = placement
    ? {
        left: placement.left,
        bottom: placement.bottom,
        width: placement.width,
        maxHeight: placement.maxHeight,
      }
    : undefined;

  return (
    <div className="compose-extras" ref={rootRef}>
      <div className="compose-extras-buttons">
        <button
          type="button"
          className={`compose-extras-btn${panel === "emoji" ? " is-active" : ""}`}
          aria-label="Emoji"
          aria-expanded={panel === "emoji"}
          aria-controls={panelId}
          disabled={disabled}
          onClick={() => setPanel((current) => (current === "emoji" ? null : "emoji"))}
        >
          😊
        </button>
        {enableGif && onPickGif ? (
          <button
            type="button"
            className={`compose-extras-btn${panel === "gif" ? " is-active" : ""}`}
            aria-label="GIF"
            aria-expanded={panel === "gif"}
            aria-controls={panelId}
            disabled={disabled}
            onClick={() => setPanel((current) => (current === "gif" ? null : "gif"))}
          >
            GIF
          </button>
        ) : null}
      </div>

      {panel === "emoji" ? (
        <div
          id={panelId}
          ref={panelRef}
          className="compose-extras-panel compose-extras-panel--fixed"
          role="dialog"
          aria-label="Emoji picker"
          style={panelStyle}
        >
          <div className="compose-extras-tabs" role="tablist" aria-label="Emoji categories">
            {EMOJI_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={group.id === activeGroup.id}
                className={group.id === activeGroup.id ? "is-active" : ""}
                onClick={() => setEmojiGroup(group.id)}
              >
                {group.label}
              </button>
            ))}
          </div>
          <div className="compose-emoji-grid" role="listbox" aria-label={activeGroup.label}>
            {activeGroup.emojis.map((emoji) => (
              <button
                key={`${activeGroup.id}-${emoji}`}
                type="button"
                className="compose-emoji-cell"
                onClick={() => {
                  onInsertEmoji(emoji);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {panel === "gif" && onPickGif ? (
        <div
          id={panelId}
          ref={panelRef}
          className="compose-extras-panel compose-extras-panel--fixed"
          role="dialog"
          aria-label="GIF picker"
          style={panelStyle}
        >
          <label className="compose-gif-search">
            <span className="visually-hidden">Search GIFs</span>
            <input
              type="search"
              value={gifQuery}
              onChange={(event) => setGifQuery(event.target.value)}
              placeholder="Search GIFs…"
              autoComplete="off"
            />
          </label>
          {gifError ? <p className="compose-gif-note">{gifError}</p> : null}
          {gifBusy ? <p className="compose-gif-note">Searching…</p> : null}
          <div className="compose-gif-grid">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                className="compose-gif-cell"
                title={gif.title}
                onClick={() => {
                  onPickGif(gif);
                  setPanel(null);
                }}
              >
                <img src={gif.previewUrl} alt={gif.title} loading="lazy" />
              </button>
            ))}
          </div>
          <p className="compose-gif-note">
            {import.meta.env.VITE_GIPHY_API_KEY
              ? "Powered by GIPHY"
              : "Curated pack — set VITE_GIPHY_API_KEY for full search"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function insertAtCursor(
  value: string,
  insert: string,
  el: HTMLTextAreaElement | null,
): { next: string; caret: number } {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = `${value.slice(0, start)}${insert}${value.slice(end)}`;
  return { next, caret: start + insert.length };
}
