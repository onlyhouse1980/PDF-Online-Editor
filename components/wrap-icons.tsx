import React from 'react';

// Word-style Wrap Icons using a semi-circle (arc) as the "image" subject.
// In Word, the arc represents an irregular image shape.

const ArcShape = () => (
  <path d="M 8 16 A 4 4 0 0 1 16 16 Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
);
const ArcOutline = () => (
  <path d="M 8 16 A 4 4 0 0 1 16 16 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
);

export const WrapInlineIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className={className}>
    <path d="M4 6h16M4 10h16M4 14h3" />
    <path d="M19 14h1" />
    <g transform="translate(-1.5, -1)">
      <ArcShape />
    </g>
    <path d="M4 18h16" />
  </svg>
);

export const WrapSquareIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className={className}>
    <path d="M4 5h16M4 9h3M17 9h3M4 13h3M17 13h3M4 17h16" />
    <rect x="8" y="7.5" width="8" height="6.5" fill="currentColor" stroke="none" />
  </svg>
);

export const WrapTightIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className={className}>
    <path d="M4 5h16M4 9h2.5M17.5 9h2.5M4 13h3.5M16.5 13h3.5M4 17h16" />
    <g transform="translate(0, -1.5)">
      <ArcShape />
    </g>
  </svg>
);

export const WrapThroughIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className={className}>
    <path d="M4 5h16M4 9h2.5M17.5 9h2.5M4 13h16M4 17h16" />
    <g transform="translate(0, -1.5)">
      <ArcOutline />
    </g>
  </svg>
);

export const WrapTopBottomIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className={className}>
    <path d="M4 5h16M4 9h16M4 17h16M4 21h16" />
    <g transform="translate(0, -1.5)">
      <ArcShape />
    </g>
  </svg>
);

export const WrapBehindIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className={className}>
    <g transform="translate(0, -1.5)">
      <ArcOutline />
    </g>
    <path d="M4 7h16M4 11h16M4 15h16M4 19h16" />
  </svg>
);

export const WrapFrontIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className={className}>
    <path d="M4 7h16M4 11h16M4 15h16M4 19h16" />
    <g transform="translate(0, -1.5)">
      <ArcShape />
    </g>
  </svg>
);

