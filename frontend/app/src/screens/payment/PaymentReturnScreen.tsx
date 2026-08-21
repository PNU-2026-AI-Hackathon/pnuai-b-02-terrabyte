import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { font } from '../../appTheme/glass';
import { palette } from '../../appTheme/palette';
import { scaleTypography } from '../../appTheme/scaleTypography';
import { typeScale } from '../../appTheme/typography';
import { ActionButton } from '../../components/ActionButton';
import { BrandMark } from '../../components/BrandMark';
import { Surface } from '../../components/Surface';
import { getOrders } from '../../order/orderApi';
import { confirmPayment, readyPayment, recordPaymentFailure, type Payment } from '../../payment/paymentApi';
import type { PaymentReturn } from '../../payment/paymentReturn';
import { requestTossPayment } from '../../payment/tossPayment';

type ResultState =
  | { status: 'processing'; message: string }
  | { status: 'success'; payment: Payment }
  | { status: 'fail'; message: string; retrying: boolean };

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function PaymentReturnScreen({ result, onDone }: { result: PaymentReturn; onDone: () => void }) {
  const started = useRef(false);
  const [state, setState] = useState<ResultState>({
    status: 'processing',
    message: result.type === 'success' ? '결제 승인을 확인하고 있어요…' : '결제 실패 정보를 확인하고 있어요…',
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const processResult = async () => {
      try {
        if (result.type === 'success') {
          const payment = await confirmPayment(result.paymentKey, result.orderId, result.amount);
          setState({ status: 'success', payment });
          return;
        }
        await recordPaymentFailure(result.orderId, result.code, result.message);
        setState({ status: 'fail', message: result.message, retrying: false });
      } catch (error) {
        setState({
          status: 'fail',
          message: messageOf(error, '결제 결과를 처리하지 못했습니다.'),
          retrying: false,
        });
      }
    };

    void processResult();
  }, [result]);

  const retry = async () => {
    setState((current) => current.status === 'fail' ? { ...current, retrying: true } : current);
    try {
      const orders = await getOrders();
      const order = orders.find((candidate) => candidate.orderNumber === result.orderId);
      if (!order) throw new Error('다시 결제할 주문을 찾을 수 없습니다.');
      const ready = await readyPayment(order.id);
      await requestTossPayment(ready);
    } catch (error) {
      setState({
        status: 'fail',
        message: messageOf(error, '결제창을 다시 열지 못했습니다.'),
        retrying: false,
      });
    }
  };

  const successful = state.status === 'success';
  return (
    <View style={styles.page}>
      <BrandMark />
      <Surface style={styles.card}>
        <View style={[styles.icon, successful ? styles.successIcon : state.status === 'fail' ? styles.failIcon : null]}>
          <Text style={styles.iconText}>{successful ? '✓' : state.status === 'fail' ? '!' : '…'}</Text>
        </View>
        <Text style={styles.eyebrow}>TERRABYTE PAYMENT</Text>
        <Text style={styles.title}>{successful ? '결제가 완료됐어요' : state.status === 'fail' ? '결제를 완료하지 못했어요' : '결제 확인 중'}</Text>
        <Text accessibilityRole={state.status === 'fail' ? 'alert' : undefined} style={styles.description}>
          {successful
            ? `${state.payment.amount.toLocaleString('ko-KR')}원 결제가 정상적으로 승인됐습니다.`
            : state.status === 'fail'
              ? state.message
              : state.message}
        </Text>
        {successful ? (
          <View style={styles.paymentInfo}>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>주문 번호</Text><Text style={styles.infoValue}>{state.payment.orderNumber}</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoLabel}>결제 수단</Text><Text style={styles.infoValue}>{state.payment.method ?? '확인 중'}</Text></View>
          </View>
        ) : null}
        <View style={styles.actions}>
          {state.status === 'fail' ? <ActionButton disabled={state.retrying} label={state.retrying ? '결제창 여는 중…' : '다시 결제하기'} onPress={() => { void retry(); }} /> : null}
          {state.status !== 'processing' ? <ActionButton label="쇼핑으로 돌아가기" onPress={onDone} quiet={state.status === 'fail'} /> : null}
        </View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create(scaleTypography({
  page: { alignItems: 'center', flex: 1, gap: 24, justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', gap: 16, maxWidth: 560, padding: 40, width: '100%' },
  icon: { alignItems: 'center', backgroundColor: palette.panelMuted, borderRadius: 999, height: 64, justifyContent: 'center', width: 64 },
  successIcon: { backgroundColor: palette.greenSoft },
  failIcon: { backgroundColor: '#f8e8e6' },
  iconText: { color: palette.greenDark, fontFamily: font, fontSize: 28, fontWeight: '800' },
  eyebrow: { ...typeScale.label, color: palette.greenDark, fontFamily: font, letterSpacing: 1.2 },
  title: { ...typeScale.dialogTitle, color: palette.text, fontFamily: font, textAlign: 'center' },
  description: { ...typeScale.body, color: palette.secondary, fontFamily: font, textAlign: 'center' },
  paymentInfo: { borderColor: palette.line, borderRadius: 12, borderWidth: 1, marginTop: 6, overflow: 'hidden', width: '100%' },
  infoRow: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 18, justifyContent: 'space-between', minHeight: 50, paddingHorizontal: 16 },
  infoLabel: { ...typeScale.label, color: palette.muted, fontFamily: font },
  infoValue: { ...typeScale.bodyStrong, color: palette.text, flexShrink: 1, fontFamily: font, textAlign: 'right' },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 8 },
}));
