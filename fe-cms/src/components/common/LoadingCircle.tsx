import React from 'react';

interface LoadingCircleProps {
  /** Size in pixels (default: 64) */
  size?: number;
  /** Primary message (default: "Đang xử lý...") */
  title?: string;
  /** Secondary detailed status (default: "Vui lòng đợi trong giây lát...") */
  subtitle?: string;
  /** If true, renders as a full-viewport frosted overlay with backdrop blur */
  fullScreen?: boolean;
}

export const LoadingCircle: React.FC<LoadingCircleProps> = ({
  size = 64,
  title = 'Đang xử lý...',
  subtitle = 'Vui lòng đợi trong giây lát...',
  fullScreen = true,
}) => {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * 0.28;

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 44px',
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow:
          'inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 25px 50px -12px rgba(0, 0, 0, 0.6)',
        animation: 'fadeInScale 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        maxWidth: 380,
        textAlign: 'center',
        userSelect: 'none',
      }}
    >
      {/* SVG Dual-Concentric Circle Spinner */}
      <div
        style={{
          position: 'relative',
          width: size,
          height: size,
          marginBottom: 20,
          animation: 'shimmerGlow 3s ease-in-out infinite',
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            animation: 'spinSmooth 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite',
          }}
        >
          <defs>
            <linearGradient id="loadingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f86fa5" />
              <stop offset="50%" stopColor="#ec4899" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>

          {/* Background Track Circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={strokeWidth}
          />

          {/* Active Gradient Rotating Arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#loadingGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>

        {/* Inner Counter-Rotating Micro Ring */}
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            animation: 'spinReverse 2s linear infinite',
          }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius - 8}
            fill="none"
            stroke="rgba(248, 111, 165, 0.5)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={`${(radius - 8) * 2} ${(radius - 8) * 1.5}`}
          />
        </svg>

        {/* Center Breathing Light Core */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#ffffff',
            boxShadow: '0 0 10px #f86fa5, 0 0 20px #3b82f6',
            transform: 'translate(-50%, -50%)',
            animation: 'pulseSubtle 1.8s ease-in-out infinite',
          }}
        />
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: '16px',
          fontWeight: 600,
          color: '#f8fafc',
          letterSpacing: '-0.02em',
          marginBottom: 6,
        }}
      >
        {title}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div
          style={{
            fontSize: '13px',
            color: '#94a3b8',
            lineHeight: 1.5,
            letterSpacing: '-0.01em',
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );

  if (!fullScreen) {
    return content;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {content}
    </div>
  );
};
