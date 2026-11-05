export interface PixelIconProps {
  paths: ReadonlyArray<{ color: string; d: string }>;
  size?: number;
  /** Grid size of the art (16 for every ICQ small icon). */
  grid?: number;
  title?: string | undefined;
  className?: string;
}

/** Renders pixel-art paths as a crisp SVG. Decorative unless a title is given. */
export function PixelIcon({ paths, size = 16, grid = 16, title, className }: PixelIconProps) {
  return (
    <svg
      className={className ? `pixel-icon ${className}` : 'pixel-icon'}
      width={size}
      height={size}
      viewBox={`0 0 ${grid} ${grid}`}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {paths.map((p) => (
        <path key={p.color} fill={p.color} d={p.d} />
      ))}
    </svg>
  );
}
