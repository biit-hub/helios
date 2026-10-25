import {
  ChevronDown,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Clock,
  Save,
  Target,
  Sunrise,
  ListOrdered,
  Layers,
  Flag,
  Settings,
  ShieldCheck,
  Plus,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  ArrowUpRight,
  GripVertical,
  Info,
  RefreshCw,
  MessageSquare,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
const icons = {
  chevron: ChevronDown,
  edit: Pencil,
  trash: Trash2,
  move: ArrowRightLeft,
  wait: Clock,
  save: Save,
  focus: Target,
  morning: Sunrise,
  plan: ListOrdered,
  tasks: Layers,
  epics: Flag,
  settings: Settings,
  security: ShieldCheck,
  plus: Plus,
  up: ArrowUp,
  down: ArrowDown,
  check: Check,
  close: X,
  open: ArrowUpRight,
  drag: GripVertical,
  info: Info,
  refresh: RefreshCw,
  progress: MessageSquare,
  sparkles: Sparkles,
  problems: TriangleAlert,
};
export function Icon({ name }: Readonly<{ name: keyof typeof icons }>) {
  const Component = icons[name];
  return (
    <Component
      className="ui-icon"
      size={18}
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
    />
  );
}
