import { authenticatedRequest } from '../auth/authApi';

export type CarePlan = {
  generatedAt: string;
  provider: 'GEMINI';
  managementPriorities: Array<{
    factorKey: string;
    title: string;
  }>;
  factorDiagnostics: Array<{
    factorKey: string;
    finding: string;
    recommendation: string;
  }>;
  todayTasks: Array<{
    id: string;
    priority: '높음' | '보통' | '낮음';
    title: string;
    body: string;
    time: string;
  }>;
  cultivationCriteria: Array<{
    label: string;
    title: string;
    body: string;
  }>;
  improvementActions: Array<{
    number: string;
    tag: string;
    title: string;
    body: string;
    effect: string;
  }>;
  expectedOutcome: {
    title: string;
    body: string;
    expectedScore: number;
    scoreChange: number;
  };
  recommendedProducts: Array<{
    productId: string;
    name: string;
    desc: string;
    price: number;
    reason: string;
  }>;
};

export function getCarePlan(potId: number) {
  return authenticatedRequest<CarePlan>(`/api/pots/${potId}/care-plan`);
}
