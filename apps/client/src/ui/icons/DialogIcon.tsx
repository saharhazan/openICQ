export type DialogIconKind = 'error' | 'info' | 'warning' | 'question';

/** 32x32 message box icons in the Win98 style, drawn with plain SVG shapes. */
export function DialogIcon({ kind }: { kind: DialogIconKind }) {
  return (
    <svg className="dialog-icon" width={32} height={32} viewBox="0 0 32 32" aria-hidden="true" shapeRendering="crispEdges">
      {kind === 'error' ? (
        <>
          <circle cx={16} cy={16} r={14} fill="#ff0000" stroke="#800000" strokeWidth={1} />
          <path d="M10 10 L22 22 M22 10 L10 22" stroke="#ffffff" strokeWidth={3} shapeRendering="auto" />
        </>
      ) : null}
      {kind === 'warning' ? (
        <>
          <path d="M16 2 L30 29 L2 29 Z" fill="#ffff00" stroke="#000000" strokeWidth={1} shapeRendering="auto" />
          <rect x={14} y={10} width={4} height={11} fill="#000000" />
          <rect x={14} y={23} width={4} height={4} fill="#000000" />
        </>
      ) : null}
      {kind === 'info' || kind === 'question' ? (
        <>
          <path
            d="M16 2 C8 2 2 7 2 14 C2 19 5 23 10 25 L8 30 L16 26 C24 26 30 21 30 14 C30 7 24 2 16 2 Z"
            fill="#ffffff"
            stroke="#000000"
            strokeWidth={1}
            shapeRendering="auto"
          />
          {kind === 'info' ? (
            <>
              <rect x={14} y={6} width={4} height={4} fill="#0000ff" />
              <rect x={14} y={12} width={4} height={10} fill="#0000ff" />
              <rect x={12} y={20} width={8} height={2} fill="#0000ff" />
            </>
          ) : (
            <text x={16} y={21} textAnchor="middle" fontSize={16} fontWeight="bold" fill="#0000ff" fontFamily="Arial, sans-serif">
              ?
            </text>
          )}
        </>
      ) : null}
    </svg>
  );
}
