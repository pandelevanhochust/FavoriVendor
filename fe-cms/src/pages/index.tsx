import React, { useState, useEffect } from 'react';
import { Row, Col, Typography, Button, Radio, DatePicker, Space, Alert, message } from 'antd';
import {
  SyncOutlined,
  DollarCircleOutlined,
  ShoppingOutlined,
  QrcodeOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { KpiCard } from '../components/dashboard/KpiCard';
import { PaymentSourcePie } from '../components/dashboard/PaymentSourcePie';
import { RecentOrdersTable } from '../components/dashboard/RecentOrdersTable';
import { RecentTransactionsTable } from '../components/dashboard/RecentTransactionsTable';
import { fetchDashboardData, DashboardMetrics } from '../api/dashboardApi';
import { getBaseApiUrl } from '../api/client';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function DashboardPage() {
  const [loading, setLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'today' | 'yesterday' | '7days' | '30days' | 'all' | 'custom'>('today');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const [metrics, setMetrics] = useState<DashboardMetrics>({
    overview: {
      revenue: 0,
      orders: 0,
      paidOrders: 0,
      pendingOrders: 0,
      qrRevenue: 0,
      cashRevenue: 0,
      qrCount: 0,
      cashCount: 0,
    },
    paymentSources: {
      qr: { count: 0, revenue: 0, percentage: 50 },
      cash: { count: 0, revenue: 0, percentage: 50 },
    },
    recentOrders: [],
    recentTransactions: [],
  });

  const loadData = async () => {
    setLoading(true);
    try {
      let params: { startDate?: string; endDate?: string } = {};

      if (timeFilter === 'today') {
        params.startDate = dayjs().startOf('day').format('YYYY-MM-DDTHH:mm:ss');
        params.endDate = dayjs().endOf('day').format('YYYY-MM-DDTHH:mm:ss');
      } else if (timeFilter === 'yesterday') {
        params.startDate = dayjs().subtract(1, 'day').startOf('day').format('YYYY-MM-DDTHH:mm:ss');
        params.endDate = dayjs().subtract(1, 'day').endOf('day').format('YYYY-MM-DDTHH:mm:ss');
      } else if (timeFilter === '7days') {
        params.startDate = dayjs().subtract(6, 'day').startOf('day').format('YYYY-MM-DDTHH:mm:ss');
        params.endDate = dayjs().endOf('day').format('YYYY-MM-DDTHH:mm:ss');
      } else if (timeFilter === '30days') {
        params.startDate = dayjs().subtract(29, 'day').startOf('day').format('YYYY-MM-DDTHH:mm:ss');
        params.endDate = dayjs().endOf('day').format('YYYY-MM-DDTHH:mm:ss');
      } else if (timeFilter === 'custom' && dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].startOf('day').format('YYYY-MM-DDTHH:mm:ss');
        params.endDate = dateRange[1].endOf('day').format('YYYY-MM-DDTHH:mm:ss');
      }

      const res = await fetchDashboardData(params);
      setMetrics(res);
    } catch (err: any) {
      console.error(err);
      message.error('Không thể tải dữ liệu từ Backend: ' + (err.message || 'Lỗi mạng'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeFilter, dateRange]);

  const formatVnd = (amt: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amt);
  };

  return (
    <div>
      {/* Top Banner & Time Filter Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          gap: 16,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0, color: '#0f172a' }}>
            Tổng Quan Hoạt Động (HiHiBooth Studio)
          </Title>
          <Text style={{ fontSize: 13, color: '#64748b' }}>
            Đang kết nối API: <code>{getBaseApiUrl()}</code>
          </Text>
        </div>

        <Space wrap>
          <Radio.Group
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="today">Hôm nay</Radio.Button>
            <Radio.Button value="yesterday">Hôm qua</Radio.Button>
            <Radio.Button value="7days">7 ngày qua</Radio.Button>
            <Radio.Button value="30days">30 ngày</Radio.Button>
            <Radio.Button value="all">Tất cả</Radio.Button>
            <Radio.Button value="custom">Tùy chọn</Radio.Button>
          </Radio.Group>

          {timeFilter === 'custom' && (
            <RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as any)}
              format="DD/MM/YYYY"
            />
          )}

          <Button
            type="primary"
            icon={<SyncOutlined spin={loading} />}
            onClick={loadData}
            style={{ borderRadius: 8, background: '#f86fa5', borderColor: '#f86fa5' }}
          >
            Làm mới
          </Button>
        </Space>
      </div>

      {/* 4 KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            title="TỔNG DOANH THU"
            value={formatVnd(metrics.overview.revenue)}
            subValue={`${metrics.overview.paidOrders} đơn thành công`}
            icon={<DollarCircleOutlined style={{ color: '#f86fa5' }} />}
            iconBgColor="#fdf2f8"
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            title="TỔNG SỐ ĐƠN HÀNG"
            value={metrics.overview.orders}
            subValue={metrics.overview.pendingOrders > 0 ? `${metrics.overview.pendingOrders} đơn đang chờ quét` : 'Tất cả đã thanh toán'}
            icon={<ShoppingOutlined style={{ color: '#0284c7' }} />}
            iconBgColor="#f0f9ff"
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            title="DOANH THU VIETQR"
            value={formatVnd(metrics.overview.qrRevenue)}
            subValue={`${metrics.overview.qrCount} lượt quét VietQR`}
            icon={<QrcodeOutlined style={{ color: '#2563eb' }} />}
            iconBgColor="#eff6ff"
          />
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <KpiCard
            title="DOANH THU TIỀN MẶT"
            value={formatVnd(metrics.overview.cashRevenue)}
            subValue={`${metrics.overview.cashCount} lượt tiền mặt`}
            icon={<CheckCircleOutlined style={{ color: '#16a34a' }} />}
            iconBgColor="#f0fdf4"
          />
        </Col>
      </Row>

      {/* Nguồn thanh toán tỉ lệ Progress */}
      <div style={{ marginBottom: 24 }}>
        <PaymentSourcePie
          qrCount={metrics.overview.qrCount}
          qrRevenue={metrics.overview.qrRevenue}
          cashCount={metrics.overview.cashCount}
          cashRevenue={metrics.overview.cashRevenue}
        />
      </div>

      {/* Hai bảng Đơn hàng và Giao dịch ngân hàng */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <RecentOrdersTable orders={metrics.recentOrders} loading={loading} />
        </Col>
        <Col xs={24} lg={12}>
          <RecentTransactionsTable
            transactions={metrics.recentTransactions}
            loading={loading}
          />
        </Col>
      </Row>
    </div>
  );
}
