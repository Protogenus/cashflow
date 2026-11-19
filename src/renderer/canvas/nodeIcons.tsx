/** canvas/nodeIcons.tsx — inline Lucide icons, supplied by Blake 2026-11-19. */
import type { NodeType } from '../engine/types';

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function NodeIcon({ type }: { type: NodeType }) {
  switch (type) {
    case 'startingBalance':
      // lucide-circle-dollar-sign
      return <Svg><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></Svg>;
    case 'income':
      // lucide-banknote-check
      return <Svg><path d="M11.748 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4.875"/><path d="m16 19 2 2 4-4"/><path d="M18 12h.01"/><path d="M6 12h.01"/><circle cx="12" cy="12" r="2"/></Svg>;
    case 'expense':
      // lucide-banknote-arrow-down
      return <Svg><path d="M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5"/><path d="m16 19 3 3 3-3"/><path d="M18 12h.01"/><path d="M19 16v6"/><path d="M6 12h.01"/><circle cx="12" cy="12" r="2"/></Svg>;
    case 'variableAmount':
      // lucide-trending-up-down
      return <Svg><path d="M14.828 14.828 21 21"/><path d="M21 16v5h-5"/><path d="m21 3-9 9-4-4-6 6"/><path d="M21 8V3h-5"/></Svg>;
    case 'percentageSplit':
      // lucide-square-percent
      return <Svg><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m15 9-6 6"/><path d="M9 9h.01"/><path d="M15 15h.01"/></Svg>;
    case 'prioritySplit':
      // lucide-star-plus
      return <Svg><path d="M11.013 18.582 6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16l2.309-4.679a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904L20 11.5"/><path d="M15 18h6"/><path d="M18 15v6"/></Svg>;
    case 'conditional':
      // lucide-scroll-text
      return <Svg><path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/></Svg>;
    case 'goal':
      // lucide-goal
      return <Svg><path d="M12 13V2l8 4-8 4"/><path d="M20.561 10.222a9 9 0 1 1-12.55-5.29"/><path d="M8.002 9.997a5 5 0 1 0 8.9 2.02"/></Svg>;
    case 'debt':
      // lucide-banknote-x
      return <Svg><path d="M13 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5"/><path d="m17 17 5 5"/><path d="M18 12h.01"/><path d="m22 17-5 5"/><path d="M6 12h.01"/><circle cx="12" cy="12" r="2"/></Svg>;
  }
}
