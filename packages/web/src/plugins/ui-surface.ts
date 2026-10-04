/**
 * The UI package's surface for plugin web modules: the components and constants a plugin may
 * import from `@prismshadow/penguin-ui`, and nothing else. One list, read by both sides:
 *
 * - the app shares exactly these instances (shared.ts puts this module's namespace up), and
 * - the plugin build resolves `@prismshadow/penguin-ui` to a stub with one named export per name
 *   here (scripts/lib/web-shared.mjs reads this file), so a plugin importing anything else fails
 *   its build rather than rendering `undefined`.
 *
 * Everything listed is already in the app's entry bundle, or (PageFrame, PageHeader) imports only
 * what is, so sharing it adds no chunk to a page with plugins. Add a name only on the same terms,
 * when a plugin needs it: a name from a lazily loaded part of the UI package would pull that part
 * onto every page that has a plugin. Keep one `export { … } from` statement: the build reads it.
 */
export {
  Badge,
  Button,
  Checkbox,
  CloseButton,
  CopyButton,
  EmptyState,
  Field,
  GlyphIcon,
  Heading,
  ICON_GAP,
  ICON_SIZE,
  ICONS,
  InlineCode,
  Input,
  Kbd,
  Notice,
  PageFrame,
  PageHeader,
  Skeleton,
  Spinner,
  Switch,
  Text,
  Textarea,
  Tooltip,
} from "@prismshadow/penguin-ui";
