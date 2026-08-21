import { Platform } from 'react-native';

import type { ReadyPayment } from './paymentApi';

const TOSS_SDK_URL = 'https://js.tosspayments.com/v2/standard';
const TOSS_SDK_ID = 'toss-payments-sdk';

type TossPaymentRequest = {
  method: 'CARD';
  amount: { currency: 'KRW'; value: number };
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
  customerName: string;
};

type TossPayment = {
  requestPayment: (request: TossPaymentRequest) => Promise<void> | void;
};

type TossPaymentsInstance = {
  payment: (options: { customerKey: string }) => TossPayment;
};

type TossPaymentsFactory = (clientKey: string) => TossPaymentsInstance;

declare global {
  interface Window {
    TossPayments?: TossPaymentsFactory;
  }
}

let sdkPromise: Promise<TossPaymentsFactory> | null = null;

function loadTossSdk() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('현재 토스 테스트 결제는 웹에서만 지원합니다.'));
  }
  if (window.TossPayments) return Promise.resolve(window.TossPayments);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<TossPaymentsFactory>((resolve, reject) => {
    const existingScript = document.getElementById(TOSS_SDK_ID) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement('script');

    const handleLoad = () => {
      if (window.TossPayments) {
        resolve(window.TossPayments);
      } else {
        reject(new Error('토스 결제 SDK를 초기화하지 못했습니다.'));
      }
    };
    const handleError = () => reject(new Error('토스 결제 SDK를 불러오지 못했습니다.'));

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    if (!existingScript) {
      script.id = TOSS_SDK_ID;
      script.src = TOSS_SDK_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

export async function requestTossPayment(ready: ReadyPayment) {
  const TossPayments = await loadTossSdk();
  const payment = TossPayments(ready.clientKey).payment({ customerKey: ready.customerKey });
  await payment.requestPayment({
    method: 'CARD',
    amount: { currency: 'KRW', value: ready.amount },
    orderId: ready.orderNumber,
    orderName: ready.orderName,
    successUrl: ready.successUrl,
    failUrl: ready.failUrl,
    customerName: ready.customerName,
  });
}
