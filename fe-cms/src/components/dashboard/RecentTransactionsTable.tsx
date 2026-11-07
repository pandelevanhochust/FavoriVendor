import React from 'react';
import { Card, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BankTransactionItem } from '../../api/dashboardApi';
import dayjs from 'dayjs';

const { Text } = Typography;

interface RecentTransactionsTableProps {
  transactions: BankTransactionItem[];
  loading?: boolean;
}

export const RecentTransactionsTable: React.FC<RecentTransactionsTableProps> = ({
  transactions,
  loading,
}) => {
  const formatVnd = (amt: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amt);
  };

  const columns: ColumnsType<BankTransactionItem> = [
    {
      title: 'Mã GD Ngân hàng',
      dataIndex: 'transactionId',
      key: 'transactionId',
      render: (text) => (
        <Text copyable style={{ fontSize: 12, color: '#334155' }}>
          {text || 'N/A'}
        </Text>
      ),
    },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      key: 'amount',
      render: (amt) => (
        <Text strong style={{ color: '#059669' }}>
          +{formatVnd(amt)}
        </Text>
      ),
    },
    {
      title: 'Nội dung CK',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (content) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>{content || '-'}</span>
      ),
    },
    {
      title: 'Thời gian nhận',
      dataIndex: 'receivedAt',
      key: 'receivedAt',
      render: (time) => (time ? dayjs(time).format('DD/MM HH:mm:ss') : '-'),
    },
  ];

  return (
    <Card
      className="kpi-card"
      title={<span style={{ fontWeight: 700, fontSize: 16 }}>Giao Dịch Ngân Hàng VietQR Mới Nhất</span>}
      bodyStyle={{ padding: 0 }}
    >
      <Table
        dataSource={transactions}
        columns={columns}
        rowKey={(record) => record.id || record.transactionId || Math.random().toString()}
        loading={loading}
        pagination={{ pageSize: 5, hideOnSinglePage: true }}
        size="small"
      />
    </Card>
  );
};
