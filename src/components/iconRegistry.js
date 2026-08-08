// -- Icon registry -------------------------------------------------------------
//
// Config files (agents, metric sources) name an icon with a string rather than
// importing a component, because they are data — a deployment config should not
// have to import React to say which glyph a C-suite agent uses.
//
// Split out of icons.jsx rather than living beside the components, because a
// module that mixes components with constants breaks Fast Refresh. Same reason
// navSections.js sits beside Sidebar.jsx and tourSteps.js beside GuidedTour.jsx.

import {
  IconAlert, IconArchive, IconBolt, IconBrain, IconBriefcase, IconChart,
  IconCheck, IconClock, IconCopy, IconDiamond, IconDownload, IconEdit,
  IconFlask, IconFolder, IconGrid, IconHelp, IconImport, IconInfo,
  IconLightbulb, IconList, IconMegaphone, IconPencil, IconRocket, IconSearch,
  IconSettings, IconSparkle, IconTarget, IconTrash, IconUpload, IconWrench,
} from "./icons.jsx";

export const ICON_REGISTRY = {
  alert: IconAlert, archive: IconArchive, bolt: IconBolt, brain: IconBrain,
  briefcase: IconBriefcase, chart: IconChart, check: IconCheck, clock: IconClock,
  copy: IconCopy, diamond: IconDiamond, download: IconDownload, edit: IconEdit,
  flask: IconFlask, folder: IconFolder, grid: IconGrid, help: IconHelp,
  import: IconImport, info: IconInfo, lightbulb: IconLightbulb, list: IconList,
  megaphone: IconMegaphone, pencil: IconPencil, rocket: IconRocket,
  search: IconSearch, settings: IconSettings, sparkle: IconSparkle,
  target: IconTarget, trash: IconTrash, upload: IconUpload, wrench: IconWrench,
};

/** Look up an icon by config name. Falls back to a neutral mark so a config
 *  naming a glyph this set does not have degrades to a dot rather than a hole
 *  in the layout. */
export function iconFor(name) {
  return ICON_REGISTRY[name] || IconDiamond;
}
