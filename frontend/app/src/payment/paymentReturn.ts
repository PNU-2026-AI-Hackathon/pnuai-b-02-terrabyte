import { Platform } from 'react-native';

export type PaymentReturn =
  | {
      type: 'success';
      paymentKey: string;
      orderId: string;
      amount: number;
    }
  | {
      type: 'fail';
      orderId: string;
      code: string;
      message: string;
    };

export function readPaymentReturn(): PaymentReturn | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/$/, '');
  const params = new URLSearchParams(window.location.search);

  if (path === '/payment/success') {
    const paymentKey = params.get('paymentKey');
    const orderId = params.get('orderId');
    const amount = Number(params.get('amount'));
    if (!paymentKey || !orderId || !Number.isSafeInteger(amount) || amount <= 0) return null;
    return { type: 'success', paymentKey, orderId, amount };
  }

  if (path === '/payment/fail') {
    const orderId = params.get('orderId');
    if (!orderId) return null;
    return {
      type: 'fail',
      orderId,
      code: params.get('code') ?? 'PAYMENT_FAILED',
      message: params.get('message') ?? '결제를 완료하지 못했습니다.',
    };
  }

  return null;
}

export function clearPaymentReturnUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.history.replaceState({}, '', '/');
  }
}
