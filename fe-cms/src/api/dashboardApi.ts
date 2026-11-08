import { apiClient } from './client';

export interface OrderItem {
  id?: string;
  orderId: string;
  amount: number;
  finalAmount?: number;
  discountAmount?: number;
  discountCode?: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | string;
  deviceId?: string;
  qrContent?: string;
  bankTransactionId?: string;
  createdAt: string;
  paidAt?: string;
}

export interface BankTransactionItem {
  id: string;
  transactionId: string;
  refTransactionId?: string;
  referenceNumber?: string;
  amount: number;
  content: string;
  bankAccount?: string;
  transType?: string;
  orderId?: string;
  receivedAt: string;
}

export interface RevenueSummaryDto {
  transferRevenue: number;
  cashRevenue: number;
  totalRevenue: number;
  transferCount: number;
  cashCount: number;
  totalCount: number;
  totalOrders: number;
  pendingOrders: number;
}

export interface DashboardMetrics {
  overview: {
    revenue: number;
    orders: number;
    paidOrders: number;
    pendingOrders: number;
    qrRevenue: number;
    cashRevenue: number;
    qrCount: number;
    cashCount: number;
  };
  paymentSources: {
    qr: { count: number; revenue: number; percentage: number };
    cash: { count: number; revenue: number; percentage: number };
  };
  recentOrders: OrderItem[];
  recentTransactions: BankTransactionItem[];
}

export async function fetchRevenueSummary(params?: {
  startDate?: string;
  endDate?: string;
  fromDate?: string;
  toDate?: string;
  date?: string;
  tz?: number;
}): Promise<RevenueSummaryDto> {
  const res = await apiClient.get<RevenueSummaryDto>('/vendor/orders/revenue-summary', { params });
  return res.data;
}

export async function fetchDashboardData(params?: {
  startDate?: string;
  endDate?: string;
  fromDate?: string;
  toDate?: string;
  date?: string;
}): Promise<DashboardMetrics> {
  const queryParams: Record<string, any> = {};
  if (params?.date) queryParams.date = params.date;
  if (params?.fromDate) queryParams.fromDate = params.fromDate;
  if (params?.toDate) queryParams.toDate = params.toDate;
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;

  const [summaryRes, ordersRes, txnsRes] = await Promise.all([
    apiClient
      .get<RevenueSummaryDto>('/vendor/orders/revenue-summary', { params: queryParams })
      .catch(() => null),
    apiClient
      .get<OrderItem[]>('/vendor/orders', { params: { ...queryParams, limit: 30 } })
      .catch(() => ({ data: [] })),
    apiClient
      .get<BankTransactionItem[]>('/vendor/transactions', { params: { ...queryParams, limit: 30 } })
      .catch(() => ({ data: [] })),
  ]);

  const orders = Array.isArray(ordersRes?.data) ? ordersRes.data : [];
  const txns = Array.isArray(txnsRes?.data) ? txnsRes.data : [];

  // Nếu API revenue-summary trả về thành công từ Database (không bị pagination)
  if (summaryRes?.data) {
    const s = summaryRes.data;
    const grandTotal = s.transferRevenue + s.cashRevenue;
    const qrPct = grandTotal > 0 ? Math.round((s.transferRevenue / grandTotal) * 100) : 50;
    const cashPct = grandTotal > 0 ? 100 - qrPct : 50;

    return {
      overview: {
        revenue: s.totalRevenue,
        orders: s.totalOrders,
        paidOrders: s.totalCount,
        pendingOrders: s.pendingOrders,
        qrRevenue: s.transferRevenue,
        cashRevenue: s.cashRevenue,
        qrCount: s.transferCount,
        cashCount: s.cashCount,
      },
      paymentSources: {
        qr: { count: s.transferCount, revenue: s.transferRevenue, percentage: qrPct },
        cash: { count: s.cashCount, revenue: s.cashRevenue, percentage: cashPct },
      },
      recentOrders: orders,
      recentTransactions: txns,
    };
  }

  // Fallback nếu API summary chưa sẵn sàng: tính dựa trên danh sách orders
  let totalRevenue = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let qrRevenue = 0;
  let cashRevenue = 0;
  let qrCount = 0;
  let cashCount = 0;

  for (const o of orders) {
    const isPaid = (o.status || '').toUpperCase() === 'PAID';
    const amount = Number(o.finalAmount || o.amount || 0);

    const isCash =
      (o.qrContent || '').toUpperCase() === 'CASH' ||
      (o.bankTransactionId || '').toUpperCase().startsWith('CASH-');

    if (isPaid) {
      paidCount++;
      totalRevenue += amount;
      if (isCash) {
        cashCount++;
        cashRevenue += amount;
      } else {
        qrCount++;
        qrRevenue += amount;
      }
    } else if ((o.status || '').toUpperCase() === 'PENDING') {
      pendingCount++;
    }
  }

  const grandTotal = qrRevenue + cashRevenue;
  const qrPct = grandTotal > 0 ? Math.round((qrRevenue / grandTotal) * 100) : 50;
  const cashPct = grandTotal > 0 ? 100 - qrPct : 50;

  return {
    overview: {
      revenue: totalRevenue,
      orders: orders.length || txns.length,
      paidOrders: paidCount,
      pendingOrders: pendingCount,
      qrRevenue,
      cashRevenue,
      qrCount,
      cashCount,
    },
    paymentSources: {
      qr: { count: qrCount, revenue: qrRevenue, percentage: qrPct },
      cash: { count: cashCount, revenue: cashRevenue, percentage: cashPct },
    },
    recentOrders: orders.slice(0, 15),
    recentTransactions: txns.slice(0, 15),
  };
}
