import { useEffect, useRef } from "react";

// -- Dialog behaviour ----------------------------------------------------------
//
// Everything a layer over the app owes the keyboard, in one place. Before this,
// the app had eleven modals, two drawers and a guided tour, and not one of them
// closed on Escape, trapped focus, or gave focus back to whatever opened it.
// Escape-to-dismiss is the most reflexive interaction in dashboard software;
// its absence is felt on every single open.
//
// Applied by `Modal` (which every modal in the app routes through) and by hand
// in the three layers that are not modals: the Guide drawer, the Signal panel,
// and the tour.
//
// ## Why the focus trap is a keydown handler rather than `inert`
//
// `inert` on the rest of the document would be cleaner, but it needs a stable
// "everything else" node to apply it to, and these layers are rendered as
// siblings inside the same tree they would have to inert. Cycling Tab inside the
// panel is the same guarantee with no structural requirement.
//
// ## Why the scroll lock sets `overflow` on <body> and not <html>
//
// index.css puts `overflow-x: clip` on both, deliberately, so that sticky
// positioning keeps resolving against the viewport. Setting `overflow: hidden`
// on <html> would make it a scroll container and break every sticky element in
// the app the moment a modal opened. On <body> the shorthand would do the same,
// so only `overflow-y` is touched and the `clip` on the x axis survives.

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Wire up dialog semantics on a panel.
 *
 * @param {object}   opts
 * @param {boolean}  opts.open      Whether the layer is mounted/visible.
 * @param {Function} opts.onClose   Called on Escape. Omit to make Escape inert
 *                                  (a layer mid-operation that must not be
 *                                  abandoned — see the Signal panel while a
 *                                  debate is running).
 * @param {boolean}  opts.lockScroll Freeze the page behind the layer. Default true.
 * @returns {object} ref to attach to the panel element.
 */
export function useDialog({ open = true, onClose, lockScroll = true } = {}) {
  const ref = useRef(null);
  // Captured on open rather than on every render: the element that had focus
  // when the layer appeared is the one that should get it back.
  const returnTo = useRef(null);

  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    returnTo.current = document.activeElement;

    // Move focus into the panel so the first Tab lands inside it rather than
    // continuing through the page underneath.
    if (panel) {
      const first = panel.querySelector(FOCUSABLE);
      // The panel itself takes focus when it holds no focusable control yet —
      // a loading state, or a modal that is pure text.
      (first || panel).focus?.({ preventScroll: true });
    }

    const onKeyDown = (e) => {
      if (e.key === "Escape" && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener("keydown", onKeyDown, true);

    let restoreOverflow;
    if (lockScroll) {
      restoreOverflow = document.body.style.overflowY;
      document.body.style.overflowY = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (lockScroll) document.body.style.overflowY = restoreOverflow || "";
      // Only take focus back if it is still inside the layer being torn down;
      // if something else has already claimed it, stealing it is the bug.
      const active = document.activeElement;
      if (returnTo.current && (!active || active === document.body || (panel && panel.contains(active)))) {
        returnTo.current.focus?.({ preventScroll: true });
      }
    };
  }, [open, onClose, lockScroll]);

  return ref;
}
