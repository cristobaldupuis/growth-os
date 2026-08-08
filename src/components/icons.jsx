// -- Icons ---------------------------------------------------------------------
//
// One monochrome stroke set on a 16px grid, every glyph inheriting
// `currentColor`. This replaces the emoji that were doing the job before.
//
// Emoji were the wrong material for three reasons, in ascending order of cost:
// they render in three different illustration styles across macOS, Windows and
// Android, so the product looked like a different product depending on whose
// laptop the meeting was on; they carry their own colour and therefore ignore
// the entire theme system — a blue book for Meta Ads and a blue circle for
// Google Ads, sitting in a gold-and-charcoal palette whose every other colour is
// contrast-checked in CI; and they were being *typed into text inputs* as the
// agent avatar mechanism.
//
// The pattern was already right in one file — LearningLibrary's list/grid
// toggle drew two 16px `currentColor` icons and they were the best-looking
// glyphs in the app. This is that, generalised.
//
// ## Rules
//
// - 16px viewBox, 1.6 stroke, round caps and joins. `size` scales the box, never
//   the stroke weight, so a 20px icon does not read as a bolder one.
// - `currentColor` only. An icon never names a colour; the thing containing it
//   does, which is what lets the same icon sit on a gold button and a muted
//   micro-label without a second variant.
// - `aria-hidden` by default. An icon beside a word is decoration and must not
//   be announced twice; an icon-only control passes `title`, which promotes it
//   to `role="img"` with an accessible name. There is no third case — an
//   icon-only control with neither is a bug this signature makes visible.
//
// Emoji remain fine in user-authored content and in model output. They are out
// of the furniture: labels, buttons, tabs, avatars, badges, source markers.

function Icon({ children, size = 16, title, strokeWidth = 1.6, fill = "none", ...rest }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16"
      fill={fill} stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
      style={{ flexShrink: 0, display: "block" }}
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/* -- Chrome and navigation -------------------------------------------------- */

export const IconMenu = (p) => <Icon {...p}><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></Icon>;
export const IconClose = (p) => <Icon {...p}><path d="M4 4l8 8M12 4l-8 8"/></Icon>;
export const IconChevronDown = (p) => <Icon {...p}><path d="M4 6.5L8 10.5l4-4"/></Icon>;
export const IconChevronRight = (p) => <Icon {...p}><path d="M6.5 4l4 4-4 4"/></Icon>;
export const IconArrowRight = (p) => <Icon {...p}><path d="M3 8h10M9 4l4 4-4 4"/></Icon>;
export const IconArrowLeft = (p) => <Icon {...p}><path d="M13 8H3M7 4L3 8l4 4"/></Icon>;
export const IconPanelClose = (p) => <Icon {...p}><path d="M13 3v10M9.5 8h-6M6 5.5L3.5 8 6 10.5"/></Icon>;
export const IconPanelOpen = (p) => <Icon {...p}><path d="M3 3v10M6.5 8h6M10 5.5L12.5 8 10 10.5"/></Icon>;
export const IconExternal = (p) => <Icon {...p}><path d="M9.5 3H13v3.5M13 3L7.5 8.5M12 9.5V13H3V4h3.5"/></Icon>;

/* -- Actions ---------------------------------------------------------------- */

export const IconPlus = (p) => <Icon {...p}><path d="M8 3v10M3 8h10"/></Icon>;
export const IconCheck = (p) => <Icon {...p}><path d="M3 8.5l3.5 3.5L13 4.5"/></Icon>;
export const IconSearch = (p) => <Icon {...p}><circle cx="7.2" cy="7.2" r="4.2"/><path d="M10.4 10.4L13.5 13.5"/></Icon>;
export const IconSettings = (p) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.1"/>
    <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7L3.6 3.6"/>
  </Icon>
);
export const IconHelp = (p) => <Icon {...p}><circle cx="8" cy="8" r="6"/><path d="M6.3 6.2a1.75 1.75 0 113 1.25c-.7.55-1.3.85-1.3 1.75"/><path d="M8 11.6v.01"/></Icon>;
export const IconSun = (p) => <Icon {...p}><circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.3M8 13.2v1.3M14.5 8h-1.3M2.8 8H1.5M12.6 3.4l-.9.9M4.3 11.7l-.9.9M12.6 12.6l-.9-.9M4.3 4.3l-.9-.9"/></Icon>;
export const IconMoon = (p) => <Icon {...p}><path d="M13 9.4A5.6 5.6 0 016.6 3a5.6 5.6 0 106.4 6.4z"/></Icon>;
export const IconRefresh = (p) => <Icon {...p}><path d="M13.3 7a5.4 5.4 0 10-.5 3.4"/><path d="M13.6 3.4V7h-3.5"/></Icon>;
export const IconTrash = (p) => <Icon {...p}><path d="M2.8 4.3h10.4M6.3 4.3V3.1a.8.8 0 01.8-.8h1.8a.8.8 0 01.8.8v1.2M4.2 4.3l.6 8.4a1 1 0 001 .9h4.4a1 1 0 001-.9l.6-8.4"/></Icon>;
export const IconEdit = (p) => <Icon {...p}><path d="M11.2 2.6l2.2 2.2-7.5 7.5-2.9.7.7-2.9z"/><path d="M9.9 3.9l2.2 2.2"/></Icon>;
export const IconCopy = (p) => <Icon {...p}><rect x="5.6" y="5.6" width="7.6" height="7.6" rx="1.3"/><path d="M10.4 5.6V4a1.2 1.2 0 00-1.2-1.2H4a1.2 1.2 0 00-1.2 1.2v5.2A1.2 1.2 0 004 10.4h1.6"/></Icon>;
export const IconUpload = (p) => <Icon {...p}><path d="M8 10.8V2.6M4.8 5.8L8 2.6l3.2 3.2M2.8 10.5v1.9a1 1 0 001 1h8.4a1 1 0 001-1v-1.9"/></Icon>;
export const IconDownload = (p) => <Icon {...p}><path d="M8 2.6v8.2M4.8 7.6L8 10.8l3.2-3.2M2.8 10.5v1.9a1 1 0 001 1h8.4a1 1 0 001-1v-1.9"/></Icon>;
export const IconImport = (p) => <Icon {...p}><path d="M4.5 2.7v10.6M2.2 5l2.3-2.3L6.8 5M11.5 13.3V2.7M9.2 11l2.3 2.3L13.8 11"/></Icon>;

/* -- Status and semantics --------------------------------------------------- */

export const IconAlert = (p) => <Icon {...p}><path d="M8 2.6L14.2 13H1.8z"/><path d="M8 6.6v3M8 11.4v.01"/></Icon>;
export const IconInfo = (p) => <Icon {...p}><circle cx="8" cy="8" r="6"/><path d="M8 7.4v3.6M8 5.2v.01"/></Icon>;
export const IconBolt = (p) => <Icon {...p}><path d="M9.1 1.8L3.4 9h4l-.5 5.2L12.6 7h-4z"/></Icon>;
export const IconSparkle = (p) => <Icon {...p}><path d="M8 1.8l1.5 4.2 4.2 1.5-4.2 1.5L8 13.2 6.5 9 2.3 7.5 6.5 6z"/></Icon>;
export const IconDiamond = (p) => <Icon {...p}><path d="M8 1.9l6.1 6.1L8 14.1 1.9 8z"/></Icon>;
export const IconTarget = (p) => <Icon {...p}><circle cx="8" cy="8" r="5.7"/><circle cx="8" cy="8" r="2.6"/><path d="M8 8v.01"/></Icon>;
export const IconLightbulb = (p) => <Icon {...p}><path d="M5.4 9.6a3.6 3.6 0 115.2 0c-.6.6-.9 1.1-.9 1.9H6.3c0-.8-.3-1.3-.9-1.9z"/><path d="M6.6 13.4h2.8"/></Icon>;
export const IconChart = (p) => <Icon {...p}><path d="M2.4 13.4h11.2"/><path d="M4.6 13.4V8.2M7.5 13.4V4.4M10.4 13.4v-3.5M13.3 13.4V6.3"/></Icon>;
export const IconTrendUp = (p) => <Icon {...p}><path d="M2.6 11.4L6.4 7.6l2.4 2.4 4.6-4.6"/><path d="M10.2 5.4h3.2v3.2"/></Icon>;
export const IconTrendDown = (p) => <Icon {...p}><path d="M2.6 4.6L6.4 8.4l2.4-2.4 4.6 4.6"/><path d="M10.2 10.6h3.2V7.4"/></Icon>;
export const IconClock = (p) => <Icon {...p}><circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.4 1.4"/></Icon>;
export const IconBlocked = (p) => <Icon {...p}><circle cx="8" cy="8" r="5.8"/><path d="M3.9 3.9l8.2 8.2"/></Icon>;

/* -- Domain ----------------------------------------------------------------- */

export const IconBrain = (p) => <Icon {...p}><path d="M6.4 2.6a2 2 0 00-2 2 1.9 1.9 0 00-.9 3.3 2 2 0 001.2 3.4 2 2 0 003.7 1V3.9a1.4 1.4 0 00-2-1.3z"/><path d="M9.6 2.6a2 2 0 012 2 1.9 1.9 0 01.9 3.3 2 2 0 01-1.2 3.4 2 2 0 01-3.7 1"/></Icon>;
export const IconArchive = (p) => <Icon {...p}><rect x="2.3" y="2.8" width="11.4" height="3" rx=".8"/><path d="M3.4 5.8v6.4a1 1 0 001 1h7.2a1 1 0 001-1V5.8M6.4 8.6h3.2"/></Icon>;
export const IconWrench = (p) => <Icon {...p}><path d="M10.2 2.4a3.4 3.4 0 00-3.4 4.3L2.6 10.9a1.4 1.4 0 102 2l4.2-4.2a3.4 3.4 0 004.3-3.4l-2 2-1.9-.5-.5-1.9z"/></Icon>;
export const IconFolder = (p) => <Icon {...p}><path d="M2.4 12.3V4.5a1 1 0 011-1h2.7l1.4 1.7h5.1a1 1 0 011 1v6.1a1 1 0 01-1 1H3.4a1 1 0 01-1-1z"/></Icon>;
export const IconMegaphone = (p) => <Icon {...p}><path d="M13.3 3.1v9.1L6.4 10V5.3z"/><path d="M6.4 5.3H3.9a1.4 1.4 0 000 2.8h2.5M5.3 8.1l.9 4.6"/></Icon>;
export const IconRocket = (p) => <Icon {...p}><path d="M6.2 9.8L3.6 9.3l1.5-2.6a7.6 7.6 0 016.7-3.9 7.6 7.6 0 01-3.9 6.7l-2.6 1.5z"/><path d="M6.2 9.8l1.5.6M4.9 11.6l-1.7 1.7"/></Icon>;
export const IconBriefcase = (p) => <Icon {...p}><rect x="2.3" y="5" width="11.4" height="7.7" rx="1"/><path d="M6 5V3.9a1 1 0 011-1h2a1 1 0 011 1V5"/></Icon>;
export const IconPencil = (p) => <Icon {...p}><path d="M11.4 2.4l2.2 2.2-8 8-2.9.7.7-2.9z"/></Icon>;
export const IconFlask = (p) => <Icon {...p}><path d="M6.4 2.4v4L2.9 12a1.1 1.1 0 00.95 1.7h8.3A1.1 1.1 0 0013.1 12L9.6 6.4v-4"/><path d="M5.5 2.4h5M4.6 9.4h6.8"/></Icon>;

/* -- Layout ----------------------------------------------------------------- */

export const IconList = (p) => <Icon {...p}><path d="M2.6 4.2h10.8M2.6 8h10.8M2.6 11.8h10.8"/></Icon>;
export const IconGrid = (p) => <Icon {...p}><rect x="2.4" y="2.4" width="4.8" height="4.8" rx="1"/><rect x="8.8" y="2.4" width="4.8" height="4.8" rx="1"/><rect x="2.4" y="8.8" width="4.8" height="4.8" rx="1"/><rect x="8.8" y="8.8" width="4.8" height="4.8" rx="1"/></Icon>;

/* -- Motion ------------------------------------------------------------------
 * The one icon that is not inert. Used wherever a button was showing a spinning
 * ⟳ character before; the arc is drawn rather than typed, so it spins around a
 * true centre instead of around whatever origin the font happened to give it.
 * The global prefers-reduced-motion block in index.css stops the rotation. */

export const IconSpinner = ({ size = 16, ...rest }) => (
  <Icon size={size} {...rest} style={{ flexShrink: 0, display: "block", animation: "spin 0.9s linear infinite" }}>
    <path d="M8 2.2a5.8 5.8 0 105.8 5.8" />
  </Icon>
);
