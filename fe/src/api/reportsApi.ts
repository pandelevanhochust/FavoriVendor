import { apiClient, ApiResponse } from './client';

export interface BankTransactionDto {
  id: number;
  transactionId: string;
  refTransactionId?: string | null;
  referenceNumber?: string | null;
  amount: number;
  content: string;
  bankAccount: string;
  transType: string;
  orderId?: string | null;
  result: string;
  transactionTimeMs: number;
  receivedAt: string;
}

export interface OrderDto {
  orderId: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  amount: number;
  originalAmount: number;
  discountAmount: number;
  discountCode?: string | null;
  qrCode?: string | null;
  content: string;
  expiresInSeconds: number;
  paidAt?: string | null;
  transaction?: BankTransactionDto | null;
}

export interface FetchOrdersParams {
  date?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
  tz?: number;
}

export interface FetchTransactionsParams {
  date?: string;
  fromDate?: string;
  toDate?: string;
  type?: string;
  page?: number;
  limit?: number;
  tz?: number;
}

export const reportsApi = {
  getOrders: async (params?: FetchOrdersParams): Promise<ApiResponse<OrderDto[]>> => {
    return apiClient.get<OrderDto[]>('vendor/orders', {
      date: params?.date,
      fromDate: params?.fromDate,
      toDate: params?.toDate,
      status: params?.status && params.status !== 'all' ? params.status : undefined,
      type: params?.type && params.type !== 'all' ? params.type : undefined,
      page: params?.page || 1,
      limit: params?.limit || 50,
      tz: params?.tz ?? 7,
    });
  },

  getTransactions: async (params?: FetchTransactionsParams): Promise<ApiResponse<BankTransactionDto[]>> => {
    return apiClient.get<BankTransactionDto[]>('vendor/transactions', {
      date: params?.date,
      fromDate: params?.fromDate,
      toDate: params?.toDate,
      type: params?.type && params.type !== 'all' ? params.type : undefined,
      page: params?.page || 1,
      limit: params?.limit || 50,
      tz: params?.tz ?? 7,
    });
  },
};
