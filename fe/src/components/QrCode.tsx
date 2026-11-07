import React, { useMemo } from 'react';

export interface QrCodeProps {
  url?: string;
  size?: number;
}

export const QrCode: React.FC<QrCodeProps> = ({ url, size = 132 }) => {
  const pattern = useMemo(() => {
    return Array.from({ length: 11 * 11 }, () => Math.random() > 0.47);
  }, []);

  if (url) {
    return (
      <div style={{ textAlign: 'center', margin: '9px auto 15px' }}>
        <img
          alt="Mã QR"
          width={220}
          height={220}
          src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&format=png&qzone=2&data=${encodeURIComponent(url)}`}
          style={{ display: 'block', margin: '0 auto' }}
        />
        <div style={{ fontSize: '11px', marginTop: '10px', wordBreak: 'break-all', color: '#7d897f' }}>
          Liên kết riêng của khách: <a href={url} target="_blank" rel="noreferrer">{url}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="qr" style={{ width: size, height: size }}>
      {pattern.map((isOff, i) => (
        <i key={i} className={isOff ? 'off' : ''} />
      ))}
    </div>
  );
};
