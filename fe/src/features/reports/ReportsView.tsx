import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { reportsApi, OrderDto, BankTransactionDto } from '@/api/reportsApi';
import {
  getBaseApiUrl,
  getApiKey,
  DEFAULT_RENDER_URL,
  DEFAULT_LOCAL_URL,
  DEFAULT_API_KEY,
  FALLBACK_API_KEY,
  setBaseApiUrl,
  setApiKey,
} from '@/api/client';
import { ReportFilterBar, ReportFilterState } from './ReportFilterBar';
import { ReportStats } from './ReportStats';
import { HourlyChart } from './HourlyChart';
import { OrdersTable } from './OrdersTable';
import { TransactionsTable } from './TransactionsTable';
import { OrderDetailModal, TxnDetailModal } from './OrderDetailModal';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';

export const ReportsView: React.FC = () => {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Filters State
  const [filter, setFilter] = useState<ReportFilterState>({
    dateMode: 'single',
    date: todayStr,
    fromDate: '',
    toDate: '',
    hourPreset: 'all',
    fromHour: 0,
    toHour: 23,
    type: 'all',
    status: 'all',
    search: '',
  });

  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'orders' | 'transactions'>('overview');
  const [selectedChartHour, setSelectedChartHour] = useState<number | null>(null);

  // Pagination State
  const [ordersPage, setOrdersPage] = useState(1);
  const [txnsPage, setTxnsPage] = useState(1);
  const [limit] = useState(50);

  // API Data State
  const [rawOrders, setRawOrders] = useState<OrderDto[]>([]);
  const [rawTxns, setRawTxns] = useState<BankTransactionDto[]>([]);
  const [ordersTotalCount, setOrdersTotalCount] = useState(0);
  const [txnsTotalCount, setTxnsTotalCount] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isServerOnline, setIsServerOnline] = useState<boolean>(true);

  // Modals Detail State
  const [selectedOrder, setSelectedOrder] = useState<OrderDto | null>(null);
  const [selectedTxn, setSelectedTxn] = useState<BankTransactionDto | null>(null);

  // Connection Config Modal State
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configUrl, setConfigUrl] = useState(getBaseApiUrl());
  const [configApiKey, setConfigApiKey] = useState(getApiKey());

  // Fetch Data Function
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const dateParam = filter.dateMode === 'single' ? filter.date : undefined;
    const fromDateParam = filter.dateMode === 'range' ? filter.fromDate : undefined;
    const toDateParam = filter.dateMode === 'range' ? filter.toDate : undefined;

    const [ordersRes, txnsRes] = await Promise.all([
      reportsApi.getOrders({
        date: dateParam,
        fromDate: fromDateParam,
        toDate: toDateParam,
        status: filter.status !== 'all' ? filter.status : undefined,
        type: filter.type !== 'all' && filter.type !== 'no_order' ? filter.type : undefined,
        page: ordersPage,
        limit,
      }),
      reportsApi.getTransactions({
        date: dateParam,
        fromDate: fromDateParam,
        toDate: toDateParam,
        type: filter.type !== 'all' ? filter.type : undefined,
        page: txnsPage,
        limit,
      }),
    ]);

    setIsLoading(false);

    let hasData = false;

    if (txnsRes.data) {
      setRawTxns(txnsRes.data);
      setTxnsTotalCount(txnsRes.totalCount);
      hasData = true;
    }

    if (ordersRes.data) {
      setRawOrders(ordersRes.data);
      setOrdersTotalCount(ordersRes.totalCount);
      hasData = true;
    } else if (txnsRes.data && (ordersRes.status === 405 || ordersRes.status === 404)) {
      // Fallback: If cloud backend has transactions but not GET /vendor/orders yet,
      // synthesize orders from transactions list so reports and statistics display seamlessly.
      const derivedOrders: OrderDto[] = txnsRes.data
        .filter((t) => t.orderId)
        .map((t) => ({
          orderId: t.orderId!,
          status: 'PAID' as const,
          amount: t.amount,
          originalAmount: t.amount,
          discountAmount: 0,
          discountCode: null,
          content: t.content,
          expiresInSeconds: 0,
          paidAt: t.receivedAt || (t.transactionTimeMs ? new Date(t.transactionTimeMs).toISOString() : null),
          transaction: t,
        }));
      setRawOrders(derivedOrders);
      setOrdersTotalCount(derivedOrders.length);
      hasData = true;
    }

    if (hasData) {
      setIsServerOnline(true);
      setErrorMessage(null);
    } else {
      setIsServerOnline(false);
      setErrorMessage(ordersRes.error || txnsRes.error || 'Lỗi tải dữ liệu máy chủ');
    }
  }, [filter, ordersPage, txnsPage, limit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFilterChange = (updates: Partial<ReportFilterState>) => {
    setFilter((prev) => ({ ...prev, ...updates }));
    setOrdersPage(1);
    setTxnsPage(1);
  };

  // Helper to get hour in GMT+7
  const getVnHour = (isoOrMs?: string | number | null): number | null => {
    if (!isoOrMs) return null;
    try {
      const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
      if (isNaN(d.getTime())) return null;
      return (d.getUTCHours() + 7) % 24;
    } catch {
      return null;
    }
  };

  // Client-side hour & search filtering for accurate local slicing
  const filteredOrders = useMemo(() => {
    return rawOrders.filter((o) => {
      // 1. Hour filter (either from slider or chart click)
      if (selectedChartHour !== null) {
        const h = getVnHour(o.paidAt);
        if (h !== selectedChartHour) return false;
      } else if (filter.fromHour > 0 || filter.toHour < 23) {
        const h = getVnHour(o.paidAt);
        if (h !== null && (h < filter.fromHour || h > filter.toHour)) return false;
      }

      // 2. Search filter
      if (filter.search.trim()) {
        const q = filter.search.toLowerCase();
        const matchId = o.orderId.toLowerCase().includes(q);
        const matchContent = o.content.toLowerCase().includes(q);
        const matchTxn = o.transaction?.transactionId.toLowerCase().includes(q);
        if (!matchId && !matchContent && !matchTxn) return false;
      }

      return true;
    });
  }, [rawOrders, selectedChartHour, filter.fromHour, filter.toHour, filter.search]);

  const filteredTxns = useMemo(() => {
    return rawTxns.filter((t) => {
      // 1. Hour filter
      if (selectedChartHour !== null) {
        const h = getVnHour(t.receivedAt || t.transactionTimeMs);
        if (h !== selectedChartHour) return false;
      } else if (filter.fromHour > 0 || filter.toHour < 23) {
        const h = getVnHour(t.receivedAt || t.transactionTimeMs);
        if (h !== null && (h < filter.fromHour || h > filter.toHour)) return false;
      }

      // 2. Search filter
      if (filter.search.trim()) {
        const q = filter.search.toLowerCase();
        const matchId = t.transactionId.toLowerCase().includes(q);
        const matchOrder = t.orderId?.toLowerCase().includes(q);
        const matchContent = t.content.toLowerCase().includes(q);
        const matchAcc = t.bankAccount.toLowerCase().includes(q);
        if (!matchId && !matchOrder && !matchContent && !matchAcc) return false;
      }

      return true;
    });
  }, [rawTxns, selectedChartHour, filter.fromHour, filter.toHour, filter.search]);

  const currentApiUrl = getBaseApiUrl();

  const handleToggleServer = () => {
    const nextUrl =
      currentApiUrl.includes('localhost') ? DEFAULT_RENDER_URL : DEFAULT_LOCAL_URL;
    setBaseApiUrl(nextUrl);
    setConfigUrl(nextUrl);
    loadData();
  };

  const handleOpenConfigModal = () => {
    setConfigUrl(getBaseApiUrl());
    setConfigApiKey(getApiKey());
    setShowConfigModal(true);
  };

  const handleSaveConfig = () => {
    setBaseApiUrl(configUrl);
    setApiKey(configApiKey);
    setShowConfigModal(false);
    loadData();
  };

  return (
    <div className="reports-wrap">
      {/* Header with Server status & Config button */}
      <div className="reports-header">
        <div>
          <h1>Báo cáo & Đối soát giao dịch</h1>
          <p>Thống kê đơn hàng Kiosk, dòng tiền mặt và lịch sử chuyển khoản VietQR</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className={`server-pill ${isServerOnline ? 'online' : 'offline'}`}
            onClick={handleToggleServer}
            title="Nhấn để đổi nhanh giữa Local (5000) và Render"
          >
            <i />
            <span>
              Server:{' '}
              <b>
                {currentApiUrl.includes('render')
                  ? 'Cloud (Render)'
                  : 'Local (5000)'}
              </b>
            </span>
          </button>

          <Button
            size="small"
            variant="soft"
            onClick={handleOpenConfigModal}
            title="Cài đặt kết nối máy chủ và API Key"
          >
            ⚙️ Cấu hình API
          </Button>
        </div>
      </div>

      {/* Error Alert if server has issue */}
      {errorMessage && (
        <div
          style={{
            background: '#fff5f5',
            border: '1px solid #feb2b2',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '12px',
            color: '#c53030',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>⚠️ {errorMessage}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              size="small"
              variant="warn"
              onClick={handleToggleServer}
            >
              Đổi sang {currentApiUrl.includes('render') ? 'Local (5000)' : 'Render'}
            </Button>
            <Button
              size="small"
              variant="default"
              onClick={handleOpenConfigModal}
            >
              Cấu hình lại API Key
            </Button>
          </div>
        </div>
      )}

      {/* Filter Bar with Date, Hour and Type filters */}
      <ReportFilterBar
        filter={filter}
        onChangeFilter={handleFilterChange}
        onRefresh={loadData}
        isLoading={isLoading}
      />

      {/* Summary KPI Cards */}
      <ReportStats
        orders={filteredOrders}
        transactions={filteredTxns}
      />

      {/* Hourly Bar Chart */}
      <HourlyChart
        orders={rawOrders}
        transactions={rawTxns}
        selectedHour={selectedChartHour}
        onSelectHour={(hour) => setSelectedChartHour(hour)}
      />

      {/* Navigation Sub-Tabs */}
      <div className="sub-tabs">
        <button
          className={`sub-tab-btn ${activeSubTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('overview')}
        >
          <span>Tất cả dữ liệu</span>
        </button>
        <button
          className={`sub-tab-btn ${activeSubTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('orders')}
        >
          <span>Đơn hàng Kiosk</span>
          <span className="sub-tab-badge">{filteredOrders.length}</span>
        </button>
        <button
          className={`sub-tab-btn ${activeSubTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('transactions')}
        >
          <span>Giao dịch ngân hàng & Tiền mặt</span>
          <span className="sub-tab-badge">{filteredTxns.length}</span>
        </button>
      </div>

      {/* Subtab Contents */}
      {activeSubTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ font: '700 15px Manrope', margin: 0, color: 'var(--ink)' }}>
                Đơn hàng gần nhất ({filteredOrders.length})
              </h3>
              <Button size="small" onClick={() => setActiveSubTab('orders')}>
                Xem toàn bộ đơn →
              </Button>
            </div>
            <OrdersTable
              orders={filteredOrders.slice(0, 10)}
              totalCount={filteredOrders.length}
              currentPage={1}
              limit={10}
              onPageChange={() => {}}
              onSelectOrder={(order) => setSelectedOrder(order)}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ font: '700 15px Manrope', margin: 0, color: 'var(--ink)' }}>
                Giao dịch thanh toán gần nhất ({filteredTxns.length})
              </h3>
              <Button size="small" onClick={() => setActiveSubTab('transactions')}>
                Xem toàn bộ giao dịch →
              </Button>
            </div>
            <TransactionsTable
              transactions={filteredTxns.slice(0, 10)}
              totalCount={filteredTxns.length}
              currentPage={1}
              limit={10}
              onPageChange={() => {}}
              onSelectTxn={(txn) => setSelectedTxn(txn)}
            />
          </div>
        </div>
      )}

      {activeSubTab === 'orders' && (
        <OrdersTable
          orders={filteredOrders}
          totalCount={ordersTotalCount}
          currentPage={ordersPage}
          limit={limit}
          onPageChange={(p) => setOrdersPage(p)}
          onSelectOrder={(order) => setSelectedOrder(order)}
        />
      )}

      {activeSubTab === 'transactions' && (
        <TransactionsTable
          transactions={filteredTxns}
          totalCount={txnsTotalCount}
          currentPage={txnsPage}
          limit={limit}
          onPageChange={(p) => setTxnsPage(p)}
          onSelectTxn={(txn) => setSelectedTxn(txn)}
        />
      )}

      {/* Detail Modals */}
      <OrderDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />

      <TxnDetailModal
        transaction={selectedTxn}
        onClose={() => setSelectedTxn(null)}
      />

      {/* Connection Config Modal */}
      <Modal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title="⚙️ Cấu hình kết nối API & Máy chủ"
        subtitle="Quản lý Server URL và API Key cho trang quản trị Staff"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px 0' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>
              Server URL
            </label>
            <input
              type="text"
              value={configUrl}
              onChange={(e) => setConfigUrl(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '13px',
                fontFamily: 'monospace',
              }}
              placeholder="https://favorivendor.onrender.com"
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <Button size="small" variant="soft" onClick={() => setConfigUrl(DEFAULT_RENDER_URL)}>
                Render Cloud
              </Button>
              <Button size="small" variant="soft" onClick={() => setConfigUrl(DEFAULT_LOCAL_URL)}>
                Local (localhost:5000)
              </Button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink)' }}>
              Kiosk API Key (X-Api-Key)
            </label>
            <input
              type="text"
              value={configApiKey}
              onChange={(e) => setConfigApiKey(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
              placeholder="Nhập API Key..."
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <Button size="small" variant="soft" onClick={() => setConfigApiKey(DEFAULT_API_KEY)}>
                Khóa Render (Khuyên dùng)
              </Button>
              <Button size="small" variant="soft" onClick={() => setConfigApiKey(FALLBACK_API_KEY)}>
                Khóa AppSettings
              </Button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <Button variant="default" onClick={() => setShowConfigModal(false)}>
              Huỷ
            </Button>
            <Button variant="primary" onClick={handleSaveConfig}>
              Lưu & Tải lại
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
