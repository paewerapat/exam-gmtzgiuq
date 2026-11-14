'use client';

import { use } from 'react';
import QuestionBankSubject from '@/components/question-bank/QuestionBankSubject';

export default function ChallengeQuestionsPageSubject({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = use(params);
  return <QuestionBankSubject mode="challenge" subjectId={subjectId} />;
}
