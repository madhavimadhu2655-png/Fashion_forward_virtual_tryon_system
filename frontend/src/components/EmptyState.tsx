import { Link } from "react-router-dom";
import { EmptyPanel } from "./ui";
import type { IconName } from "./Icon";

type Tone = "violet" | "rani" | "mint" | "saffron" | "sky";

// Tones are kept for backwards compatibility; each maps to an icon now.
const TONE_ICON: Record<Tone, IconName> = { violet: "sparkle", rani: "heart", mint: "check", saffron: "bag", sky: "info" };

interface EmptyStateProps {
  title: string;
  body: string;
  tone?: Tone;
  icon?: IconName;
  cta?: { to: string; label: string };
}

export default function EmptyState({ title, body, tone = "violet", icon, cta }: EmptyStateProps) {
  return (
    <div className="page max-w-3xl py-16 sm:py-24">
      <EmptyPanel
        icon={icon ?? TONE_ICON[tone]}
        title={title}
        body={body}
        action={
          cta && (
            <Link to={cta.to} className="btn btn-primary btn-lg">
              {cta.label}
            </Link>
          )
        }
      />
    </div>
  );
}
