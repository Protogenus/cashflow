/** canvas/nodeIcons.tsx — inline SVG icons (shape+color+icon redundant encoding). */
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
      return <Svg><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M6 15h4"/></Svg>;
    case 'income':
      return <Svg><path d="M12 3v10m0 0l-4-4m4 4l4-4"/><path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4"/></Svg>;
    case 'expense':
      return <Svg><path d="M12 13V3m0 0L8 7m4-4l4 4"/><path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4"/></Svg>;
    case 'variableAmount':
      return <Svg><path d="M2 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-6 5-6 2.5 6 5 6"/></Svg>;
    case 'percentageSplit':
      return <Svg><path d="M12 3v9h9"/><path d="M21.5 12.5A9 9 0 112.6 8.2"/></Svg>;
    case 'prioritySplit':
      return <Svg><path d="M4 6h16M4 12h16M4 18h10"/></Svg>;
    case 'conditional':
      return <Svg><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M8 7l7.5 4M8 17l7.5-4"/></Svg>;
    case 'goal':
      return <Svg><path d="M5 21V4"/><path d="M5 4h13l-3 4 3 4H5"/></Svg>;
    case 'debt':
      return <Svg><path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1.5-1.5"/></Svg>;
  }
}
