import React from 'react';
import { Card, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { OrderItem } from '../../api/dashboardApi';
import dayjs from 'dayjs';

const { Text } = Typography;

interface RecentOrdersTableProps {
  orders: OrderItem[];
  loading?: boolean;
}

export const RecentOrdersTable: React.FC<RecentOrdersTableProps> = ({ orders, loading }) => {
  const formatVnd = (amt: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amt);
  };

  const columns: ColumnsType<OrderItem> = [
    {
      title: 'Mã đơn',
      dataIndex: 'orderId',
      key: 'orderId',
      render: (text) => (
        <Text strong style={{ color: '#0f172a' }}>
          {text || 'N/A'}
        </Text>
      ),
    },
    {
      title: 'Số tiền',
      key: 'amount',
      render: (_, record) => {
        const amt = record.finalAmount || record.amount;
        return <Text strong>{formatVnd(amt)}</Text>;
      },
    },
    {
      title: 'Hình thức',
      key: 'type',
      render: (_, record) => {
        const isCash =
          (record.qrContent || '').toUpperCase() === 'CASH' ||
          (record.bankTransactionId || '').toUpperCase().startsWith('CASH-');
        return isCash ? (
          <Tag color="green">Tiền mặt</Tag>
        ) : (
          <Tag color="blue">VietQR</Tag>
        );
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const s = (status || '').toUpperCase();
        if (s === 'PAID') return <Tag color="success">ĐÃ THANH TOÁN</Tag>;
        if (s === 'PENDING') return <Tag color="warning">CHỜ QUÉT</Tag>;
        if (s === 'EXPIRED') return <Tag color="default">HẾT HẠN</Tag>;
        return <Tag color="error">{s}</Tag>;
      },
    },
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time) => (time ? dayjs(time).format('DD/MM HH:mm') : '-'),
    },
  ];

  return (
    <Card
      className="kpi-card"
      title={<span style={{ fontWeight: 700, fontSize: 16 }}>Đơn Hàng Gần Nhất</span>}
      bodyStyle={{ padding: 0 }}
    >
      <Table
        dataSource={orders}
        columns={columns}
        rowKey={(record) => record.orderId || Math.random().toString()}
        loading={loading}
        pagination={{ pageSize: 5, hideOnSinglePage: true }}
        size="small"
      />
    </Card>
  );
};
