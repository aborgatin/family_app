import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';

/** How far the row slides to reveal «Удалить» (px); a longer swipe stops there. */
const REVEAL = 88;
/** A move shorter than this (px) is still a tap. */
const SLOP = 8;

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  /** The offset when the finger went down. */
  from: number;
  /** Decided after the first move past `SLOP`: sideways is a swipe, up/down is scrolling. */
  sideways?: boolean;
}

type SwipeToDeleteProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Already translated, «Удалить». */
  label: string;
  /** Runs on «Удалить» (which should ask first). */
  onDelete: () => void;
  /** Off: the row doesn't move (e.g. in edit mode). */
  disabled?: boolean;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
};

/**
 * Swipe a row left on a touch screen to reveal a red «Удалить» behind it, as on iOS. A full swipe
 * only reveals it: deleting is always a separate tap, which then asks. A swipe right, a tap on the
 * row or a tap anywhere else closes it. Touch only: mouse and pen do nothing (the Mac uses
 * right-click, keyboards use edit mode). Fills its row; the row's content goes inside.
 */
export function SwipeToDelete({
  label,
  onDelete,
  disabled = false,
  children,
  ref,
  ...rest
}: SwipeToDeleteProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  const swiped = useRef(false);
  const root = useRef<HTMLDivElement | null>(null);
  // Turning it off (edit mode) closes it.
  const [wasDisabled, setWasDisabled] = useState(disabled);
  if (disabled !== wasDisabled) {
    setWasDisabled(disabled);
    if (disabled) setOffset(0);
  }
  const open = offset < 0;

  // While open, a tap anywhere outside the row closes it.
  useEffect(() => {
    if (!open || dragging) return;
    function outside(event: globalThis.PointerEvent) {
      if (!(event.target instanceof Node) || root.current?.contains(event.target) !== true) {
        setOffset(0);
      }
    }
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, [open, dragging]);

  function down(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.pointerType !== 'touch') return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, from: offset };
    swiped.current = false;
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (current.sideways === undefined) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      current.sideways = Math.abs(dx) > Math.abs(dy);
      if (!current.sideways) {
        drag.current = null;
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    swiped.current = true;
    setOffset(Math.min(0, Math.max(-REVEAL, current.from + dx)));
  }

  function up(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    setOffset((now) => (now < -REVEAL / 2 ? -REVEAL : 0));
  }

  return (
    <div
      {...rest}
      ref={(element) => {
        root.current = element;
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      }}
      className="relative flex flex-1 self-stretch overflow-hidden"
    >
      {open && (
        <button
          type="button"
          onClick={() => {
            setOffset(0);
            onDelete();
          }}
          className={
            'absolute inset-y-0 right-0 flex cursor-pointer items-center justify-center ' +
            'bg-destructive px-2 text-body text-on-accent focus-visible:outline-2 ' +
            'focus-visible:-outline-offset-4 focus-visible:outline-on-accent'
          }
          style={{ width: REVEAL }}
        >
          {label}
        </button>
      )}
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(event) => {
          // The click that ends a swipe, or a tap while open, only closes the row.
          if (swiped.current || (open && !dragging)) {
            event.preventDefault();
            event.stopPropagation();
            swiped.current = false;
            setOffset(0);
          }
        }}
        className={
          'relative flex min-w-0 flex-1 touch-pan-y bg-cell ' +
          (dragging ? '' : 'transition-transform duration-200 ease-out')
        }
        style={{ transform: offset === 0 ? undefined : `translateX(${String(offset)}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
