import { authenticatedRequest } from '../auth/authApi';

export type PaymentStatus = 'READY' | 'CONFIRMING' | 'PAID' | 'FAILED' | 'CANCELLED';

export type ReadyPayment = {
  paymentId: number;
  orderId: number;
  orderNumber: string;
  amount: number;
  orderName: string;
  customerName: string;
  customerKey: string;
  clientKey: string;
  successUrl: string;
  failUrl: string;
  status: PaymentStatus;
};

export type Payment = {
  id: number;
  orderId: number;
  orderNumber: string;
  provider: 'TOSS';
  status: PaymentStatus;
  amount: number;
  paymentKey?: string | null;
  method?: string | null;
  providerStatus?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  receiptUrl?: string | null;
  requestedAt: string;
  approvedAt?: string | null;
  cancelledAt?: string | null;
};

export function readyPayment(orderId: number) {
  return authenticatedRequest<ReadyPayment>('/api/payments/ready', {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  });
}

export function confirmPayment(paymentKey: string, orderId: string, amount: number) {
  return authenticatedRequest<Payment>('/api/payments/confirm', {
    method: 'POST',
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
}

export function recordPaymentFailure(orderId: string, code: string, message: string) {
  return authenticatedRequest<Payment>('/api/payments/fail', {
    method: 'POST',
    body: JSON.stringify({ orderId, code, message }),
  });
}

export function getOrderPayment(orderId: number) {
  return authenticatedRequest<Payment>(`/api/orders/${orderId}/payment`);
}

export function cancelPayment(paymentId: number, cancelReason: string) {
  return authenticatedRequest<Payment>(`/api/payments/${paymentId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ cancelReason }),
  });
}
