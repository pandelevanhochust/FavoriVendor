import React from 'react';
import { Card, Progress, Row, Col, Typography } from 'antd';
import { QrcodeOutlined, DollarCircleOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

interface PaymentSourcePieProps {
  qrCount: number;
  qrRevenue: number;
  cashCount: number;
  cashRevenue: number;
}

export const PaymentSourcePie: React.FC<PaymentSourcePieProps> = ({
  qrCount,
  qrRevenue,
  cashCount,
  cashRevenue,
}) => {
  const totalRev = qrRevenue + cashRevenue;
  const qrPercent = totalRev > 0 ? Math.round((qrRevenue / totalRev) * 100) : 50;
  const cashPercent = totalRev > 0 ? 100 - qrPercent : 50;

  const formatVnd = (amt: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amt);
  };

  return (
    <Card
      className="kpi-card"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Nguồn Thanh Toán</span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>
            (Phân bổ theo hình thức thu tiền)
          </span>
        </div>
      }
      bodyStyle={{ padding: '20px' }}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
          <span style={{ color: '#2563eb', fontWeight: 600 }}>
            <QrcodeOutlined /> Chuyển khoản VietQR ({qrPercent}%)
          </span>
          <span style={{ color: '#16a34a', fontWeight: 600 }}>
            Tiền mặt Cash ({cashPercent}%) <DollarCircleOutlined />
          </span>
        </div>
        <Progress
          percent={qrPercent}
          success={{ percent: cashPercent, strokeColor: '#16a34a' }}
          strokeColor="#2563eb"
          showInfo={false}
          size={['100%', 14]}
        />
      </div>

      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        <Col span={12}>
          <div
            style={{
              padding: '14px',
              borderRadius: 10,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1d4ed8' }}>
              <QrcodeOutlined style={{ fontSize: 16 }} />
              <Text strong style={{ color: '#1d4ed8' }}>
                VietQR Online
              </Text>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e3a8a', marginTop: 4 }}>
              {formatVnd(qrRevenue)}
            </div>
            <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>
              {qrCount} giao dịch quét mã
            </div>
          </div>
        </Col>

        <Col span={12}>
          <div
            style={{
              padding: '14px',
              borderRadius: 10,
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#15803d' }}>
              <DollarCircleOutlined style={{ fontSize: 16 }} />
              <Text strong style={{ color: '#15803d' }}>
                Tiền mặt (Cash)
              </Text>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#14532d', marginTop: 4 }}>
              {formatVnd(cashRevenue)}
            </div>
            <div style={{ fontSize: 12, color: '#16a34a', marginTop: 2 }}>
              {cashCount} đơn thu tiền mặt
            </div>
          </div>
        </Col>
      </Row>
    </Card>
  );
};
