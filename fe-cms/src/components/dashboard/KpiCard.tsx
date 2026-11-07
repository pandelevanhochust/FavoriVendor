import React from 'react';
import { Card, Typography } from 'antd';

const { Text, Title } = Typography;

interface KpiCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ReactNode;
  iconBgColor?: string;
  tagColor?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subValue,
  icon,
  iconBgColor = '#fdf2f8',
}) => {
  return (
    <Card className="kpi-card" bodyStyle={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Text style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{title}</Text>
          <Title level={3} style={{ margin: '4px 0 0 0', fontWeight: 700, color: '#0f172a' }}>
            {value}
          </Title>
          {subValue && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
              {subValue}
            </div>
          )}
        </div>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: iconBgColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
          }}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
};
