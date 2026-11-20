import React from 'react';

type SkeletonProps = {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Skeleton atom — a shimmering placeholder used while on-chain reads resolve.
 * Renders a fixed-size block so surrounding layout does not shift when the
 * real content arrives (helps keep CLS < 0.1).
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1rem',
  radius = '0.5rem',
  className,
  style,
}) => {
  return (
    <span
      aria-hidden="true"
      className={['skeleton', className].filter(Boolean).join(' ')}
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        background:
          'linear-gradient(90deg, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0.18) 37%, rgba(255,255,255,0.08) 63%)',
        backgroundSize: '400% 100%',
        animation: 'skeleton-shimmer 1.4s ease infinite',
        ...style,
      }}
    />
  );
};

export default Skeleton;
