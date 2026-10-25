import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Download,
  Eye,
  File,
  Film,
  Info,
  Link,
  LoaderCircle,
  MessageSquare,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Tag,
  TriangleAlert,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// The design system's 22 system icons: 24px grid, 2px stroke, round caps and joins.
const ICONS = {
  check: Check,
  cross: X,
  eye: Eye,
  upload: Upload,
  download: Download,
  play: Play,
  pause: Pause,
  mic: Mic,
  clock: Clock,
  tag: Tag,
  alert: TriangleAlert,
  info: Info,
  "arrow-right": ArrowRight,
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  film: Film,
  chat: MessageSquare,
  link: Link,
  refresh: RefreshCw,
  file: File,
  circle: Circle,
  spinner: LoaderCircle,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  /** Accessible name. Without it the icon is decorative. */
  title?: string;
  className?: string;
}

export function Icon({ name, size = 20, title, className }: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      strokeWidth={2}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? "img" : undefined}
      focusable="false"
      className={cn("shrink-0", name === "spinner" && "animate-spin motion-reduce:animate-[spin_3s_linear_infinite]", className)}
    />
  );
}
