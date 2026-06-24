/**
 * Icon — thin wrapper around lucide-preact with ProMapper defaults.
 *
 * Usage: <Icon name="mic" size={18} />
 * All lucide icon names are available (camelCase component names).
 * https://lucide.dev/icons
 */

import { JSX } from "preact";
import * as LucideIcons from "lucide-preact";

type IconName = keyof typeof LucideIcons;

interface IconProps extends JSX.SVGAttributes<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 18, ...rest }: IconProps) {
  const LucideIcon = LucideIcons[name] as
    | ((props: { size?: number; [key: string]: unknown }) => JSX.Element)
    | undefined;

  if (!LucideIcon) return null;

  return <LucideIcon size={size} strokeWidth={1.75} {...rest} />;
}
