import type { ReactElement } from 'react';
import { guideFor } from '../capture/guide';

/**
 * Inline SVG guides, no video or image assets. Overhead car outline with the camera path animated by CSS
 * (see `.guide-path` in styles.css; motion is disabled for reduced-motion users). Part 7 uses a side view
 * that deliberately shows a standing person holding the phone low: it must never suggest going under a car.
 */
export function GuideDiagram({ partNo }: { partNo: number }): ReactElement {
  const title = guideFor(partNo)?.title ?? 'Guide';
  if (partNo === 7) return <UnderbodySweep />;
  return (
    <svg viewBox="0 0 200 220" role="img" aria-label={`${title}: top-down diagram of the camera path around the car`}
      className="mx-auto h-44 w-auto text-stone-700">
      <CarOutline />
      <Highlight partNo={partNo} />
      <CameraPath partNo={partNo} />
    </svg>
  );
}

function CarOutline(): ReactElement {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="70" y="30" width="60" height="160" rx="22" className="fill-white" />
      <path d="M78 66 Q100 56 122 66 L118 84 L82 84 Z" className="fill-stone-100" />
      <path d="M82 150 L118 150 L122 164 Q100 172 78 164 Z" className="fill-stone-100" />
      {[[62, 48], [130, 48], [62, 142], [130, 142]].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="8" height="28" rx="3" className="fill-stone-600" stroke="none" />
      ))}
      <text x="100" y="22" textAnchor="middle" className="fill-stone-500" stroke="none" fontSize="10">front</text>
      <text x="100" y="206" textAnchor="middle" className="fill-stone-500" stroke="none" fontSize="10">rear</text>
    </g>
  );
}

function Highlight({ partNo }: { partNo: number }): ReactElement | null {
  const fill = 'fill-teal-200/70';
  switch (partNo) {
    case 5: return <rect x="78" y="86" width="44" height="14" rx="4" className={fill} />;
    case 6: return <rect x="74" y="32" width="52" height="38" rx="14" className={fill} />;
    case 8: return <g className={fill}><rect x="78" y="96" width="19" height="22" rx="4" /><rect x="103" y="96" width="19" height="22" rx="4" /><rect x="78" y="124" width="44" height="20" rx="4" /></g>;
    default: return null;
  }
}

function CameraPath({ partNo }: { partNo: number }): ReactElement {
  const stroke = 'guide-path fill-none stroke-teal-700';
  const dot = 'fill-teal-700';
  switch (partNo) {
    case 1: return <g><path d="M42 190 L42 40" className={stroke} strokeWidth="3" /><circle cx="42" cy="190" r="5" className={dot} /><text x="14" y="118" fontSize="10" className="fill-teal-800" transform="rotate(-90 14 118)" textAnchor="middle">driver side</text></g>;
    case 2: return <g><path d="M158 40 L158 190" className={stroke} strokeWidth="3" /><circle cx="158" cy="40" r="5" className={dot} /><text x="186" y="118" fontSize="10" className="fill-teal-800" transform="rotate(90 186 118)" textAnchor="middle">passenger side</text></g>;
    case 3: return <g><path d="M52 34 Q100 6 148 34" className={stroke} strokeWidth="3" /><path d="M148 186 Q100 214 52 186" className={stroke} strokeWidth="3" /><circle cx="52" cy="34" r="5" className={dot} /><circle cx="148" cy="186" r="5" className={dot} /></g>;
    case 4: return <g>{[[66, 62], [134, 62], [66, 156], [134, 156]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="19" className={stroke} strokeWidth="2.5" />)}</g>;
    case 5: return <g><path d="M100 128 L100 104" className={stroke} strokeWidth="3" /><circle cx="100" cy="128" r="5" className={dot} /></g>;
    case 6: return <g><path d="M80 40 L120 40 L80 52 L120 52 L80 64 L120 64" className={stroke} strokeWidth="2.5" /><circle cx="80" cy="40" r="4" className={dot} /></g>;
    case 8: return <g><path d="M86 100 L114 100 L114 138 L86 138" className={stroke} strokeWidth="2.5" /><circle cx="86" cy="100" r="4" className={dot} /></g>;
    default: return <g />;
  }
}

/** Side view: the person stays standing and sweeps the phone low along the car's lower edge. */
function UnderbodySweep(): ReactElement {
  return (
    <svg viewBox="0 0 260 130" role="img"
      aria-label="Underbody, low sweep: a person standing beside the car holds the phone near knee height and moves it along the car's lower edge. They stay standing and never go under the car."
      className="mx-auto h-36 w-auto text-stone-700">
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="10" y1="112" x2="250" y2="112" />
        <path d="M96 100 L96 78 Q100 58 130 56 L178 56 Q208 58 224 82 L228 100 Z" className="fill-white" />
        <circle cx="122" cy="100" r="11" className="fill-stone-600" stroke="none" />
        <circle cx="204" cy="100" r="11" className="fill-stone-600" stroke="none" />
        <circle cx="44" cy="40" r="9" className="fill-white" />
        <path d="M44 49 L44 82 M44 82 L36 112 M44 82 L52 112 M44 58 L62 78" />
        <rect x="60" y="76" width="8" height="12" rx="2" className="fill-teal-700" stroke="none" />
      </g>
      <path d="M72 94 L180 94" className="guide-path fill-none stroke-teal-700" strokeWidth="3" />
      <text x="130" y="126" textAnchor="middle" fontSize="9" className="fill-stone-500">stay standing, phone at knee height</text>
    </svg>
  );
}
