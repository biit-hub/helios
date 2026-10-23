import {
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
} from "lucide-react";
const icons = {
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
