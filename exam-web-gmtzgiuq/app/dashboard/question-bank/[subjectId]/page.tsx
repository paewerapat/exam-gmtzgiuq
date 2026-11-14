'use client';

import { use } from 'react';
import QuestionBankSubject from '@/components/question-bank/QuestionBankSubject';

export default function QuestionBankPageSubject({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = use(params);
  return <QuestionBankSubject mode="bank" subjectId={subjectId} />;
}
