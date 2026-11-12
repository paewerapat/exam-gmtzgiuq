import {
  GradableQuestion,
  evalMathExpr,
  getAnswerStatus,
  isAnswerCorrect,
  normalizeMathAnswer,
  parseChoiceAnswer,
} from './answer-grading';

// Same cases as the web tests (exam-web-gmtzgiuq/lib/exam-utils.test.ts,
// exam-utils.multi-edge.test.ts, exam-utils.imported.test.ts), so the
// server's isCorrect matches what the result page shows (task 16 AC11).

function mcq(
  correctIds: string[],
  ids = ['a', 'b', 'c', 'd', 'e'],
  type = 'multiple_choice',
): GradableQuestion {
  return {
    type,
    choices: ids.map((id) => ({ id, isCorrect: correctIds.includes(id) })),
  };
}

const shortAnswer = (correctAnswer: string | null): GradableQuestion => ({
  type: 'short_answer',
  correctAnswer,
  choices: [],
});

const multi = mcq(['b', 'c', 'd']);
const single = mcq(['c']);

describe('parseChoiceAnswer', () => {
  it('sorts, drops duplicates, empty parts and spaces', () => {
    expect(parseChoiceAnswer('d,b, c,,b')).toEqual(['b', 'c', 'd']);
    expect(parseChoiceAnswer('')).toEqual([]);
    expect(parseChoiceAnswer(undefined)).toEqual([]);
    expect(parseChoiceAnswer(' , ')).toEqual([]);
  });
});

describe('isAnswerCorrect — choices, all-or-none (web exam-utils.test.ts)', () => {
  it('correct b,c,d', () => {
    expect(isAnswerCorrect(multi, 'b,c,d')).toBe(true);
    expect(isAnswerCorrect(multi, 'd,c,b')).toBe(true);
    expect(isAnswerCorrect(multi, 'b,c')).toBe(false);
    expect(isAnswerCorrect(multi, 'b,c,d,e')).toBe(false);
    expect(isAnswerCorrect(multi, 'b')).toBe(false);
    expect(isAnswerCorrect(multi, '')).toBe(false);
  });

  it('"" / "," is not answered', () => {
    expect(getAnswerStatus(multi, '')).toBe('unanswered');
    expect(getAnswerStatus(multi, undefined)).toBe('unanswered');
    expect(getAnswerStatus(multi, ',')).toBe('unanswered');
    expect(getAnswerStatus(multi, 'b,c')).toBe('incorrect');
    expect(getAnswerStatus(multi, 'b,c,d')).toBe('correct');
  });

  it('single correct choice c', () => {
    expect(isAnswerCorrect(single, 'c')).toBe(true);
    expect(isAnswerCorrect(single, 'b')).toBe(false);
    expect(isAnswerCorrect(single, 'b,c')).toBe(false);
  });

  it('a question without any correct choice: nothing is correct', () => {
    const none = mcq([]);
    expect(isAnswerCorrect(none, 'a')).toBe(false);
    expect(isAnswerCorrect(none, '')).toBe(false);
  });

  it('another type than short_answer is graded by choices too', () => {
    const tf = mcq(['b', 'c', 'd'], ['a', 'b', 'c', 'd', 'e'], 'true_false');
    expect(isAnswerCorrect(tf, 'b,c,d')).toBe(true);
    expect(isAnswerCorrect(tf, 'b')).toBe(false);
  });
});

describe('isAnswerCorrect — stored answers not in the canonical form (web exam-utils.multi-edge.test.ts)', () => {
  it('separators/spaces/duplicates do not change the result', () => {
    expect(isAnswerCorrect(multi, ',b,,c, d,')).toBe(true);
    expect(isAnswerCorrect(multi, 'b,b,c,d')).toBe(true);
    expect(getAnswerStatus(multi, ' , ')).toBe('unanswered');
  });

  it('single correct choice: old duplicated/spaced answer is still correct, extra choice is wrong', () => {
    expect(isAnswerCorrect(single, ' c ')).toBe(true);
    expect(isAnswerCorrect(single, 'c,c')).toBe(true);
    expect(isAnswerCorrect(single, 'c,d')).toBe(false);
  });

  it('the full set plus an id that is not a choice is wrong', () => {
    expect(isAnswerCorrect(multi, 'b,c,d,z')).toBe(false);
  });
});

describe('isAnswerCorrect — short answer', () => {
  it('number (web exam-utils.imported.test.ts: 90)', () => {
    const q = shortAnswer('90');
    expect(isAnswerCorrect(q, '90')).toBe(true);
    expect(isAnswerCorrect(q, ' 90 ')).toBe(true);
    expect(isAnswerCorrect(q, '90.0')).toBe(true);
    expect(isAnswerCorrect(q, '89')).toBe(false);
  });

  it.each([
    ['\\frac{\\sqrt{3}}{3}', 'sqrt(3)/3', true],
    ['\\frac{\\sqrt{3}}{3}', '√3/3', true],
    ['\\frac{\\sqrt{3}}{3}', '1/sqrt(3)', true],
    ['\\frac{\\sqrt{3}}{3}', '(sqrt3)/3', true],
    ['$\\frac{1}{2}$', '0.5', true],
    ['$\\frac{1}{2}$', '2/4', true],
    ['$\\frac{1}{2}$', '1/3', false],
    // parseFloat reads a leading number first: 3 vs 6 (same as the web)
    ['3×2', '6', false],
    ['√4×3', '6', true],
    ['√9÷3', '1', true],
    ['−1', '-1', true],
    ['x+1', 'X + 1', true],
    ['x+1', 'x+2', false],
    ['1e3', '1000', true],
    ['1,000', '1', true], // parseFloat stops at the comma (same as the web)
    ['\\sqrt{2}*\\sqrt{2}', '2', true],
    ['abc', '', false],
  ])('correct %j, answer %j → %s', (correct, answer, expected) => {
    expect(isAnswerCorrect(shortAnswer(correct), answer)).toBe(expected);
  });

  it('a short-answer question without a correct answer is never correct', () => {
    expect(isAnswerCorrect(shortAnswer(null), '1')).toBe(false);
    expect(isAnswerCorrect(shortAnswer(''), '')).toBe(false);
  });

  it('normalizeMathAnswer gives the same forms as the web', () => {
    expect(normalizeMathAnswer('$\\frac{\\sqrt{3}}{3}$')).toBe('(sqrt(3))/(3)');
    expect(normalizeMathAnswer(' √(2) × 3 ')).toBe('sqrt(2)*3');
    expect(normalizeMathAnswer('\\left( X \\right)')).toBe('(x)');
  });
});

/**
 * The web's evalMathExpr, copied as-is (lib/exam-utils.ts), used only here as
 * the reference: the server must give the same number without running the
 * input as code.
 */
function webEvalMathExpr(expr: string): number {
  if (!/^[0-9+\-*/().sqrteSQRTE\s]+$/.test(expr)) return NaN;
  try {
    const safe = expr.replace(/sqrt\(/gi, 'Math.sqrt(');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const run = new Function(`"use strict"; return (${safe})`) as () => unknown;
    const result = run();
    return typeof result === 'number' ? result : NaN;
  } catch {
    return NaN;
  }
}

describe('evalMathExpr — same numbers as the web without eval', () => {
  const cases = [
    // numbers
    '1',
    '1.5',
    '.5',
    '5.',
    '1e3',
    '1e-3',
    '1e+3',
    '1.e3',
    '2.5e-1',
    '0',
    '0.5',
    '0e1',
    '.0',
    '0.',
    // invalid numbers (strict mode / syntax)
    '01',
    '08',
    '00.5',
    '00',
    '2.e',
    '1e',
    '1e5e',
    '0x1',
    '1.5.3',
    '2..5',
    // operators and precedence
    '1+2',
    '1-2',
    '2*3',
    '6/4',
    '4/2/2',
    '2-3-4',
    '2*3+4*5',
    '(1+2)*(3+4)/7',
    '2**3',
    '2**3**2',
    '(-2)**2',
    '2**-2',
    '-2**2',
    '2**-3**2',
    '-(2)**2',
    '-+-3',
    '+-3',
    '3+-2',
    '2*-3',
    '- -3',
    '+ +3',
    '2 ** 3',
    '1 2',
    '--3',
    '++3',
    '3--2',
    '3*',
    '*3',
    '3**',
    // division by zero
    '1/0',
    '-1/0',
    '0/0',
    // sqrt
    'sqrt(4)',
    'SQRT(4)',
    'Sqrt(9)',
    'sqrt(3)/3',
    '(sqrt(3))/(3)',
    '1/sqrt(3)',
    'sqrt(2)*sqrt(2)',
    'sqrt(-1)',
    'sqrt(-1)**0',
    'sqrt()',
    'sqrt()**0',
    'sqrt',
    'sqrt (4)',
    'sqrt(4)(2)',
    '2sqrt(4)',
    'esqrt(4)',
    // names / property access / calls
    'e',
    'q',
    'tree',
    'test',
    'set',
    '(2)(3)',
    '2(3)',
    'sqrt(4).e',
    'sqrt(4).e**0',
    '(1).e**0',
    '2..e',
    '.e',
    '.',
    // parentheses, including the wrapper the web adds
    '(1)',
    '()',
    '((2))',
    '(2',
    '2)',
    '3)*sqrt(2',
    '3)*(2',
    // comments
    '1//2',
    '1/*2*/+3',
    '2/**/3',
    '/**/',
    '1/*',
    '1\n+2',
    '1//x\n+2',
  ];

  it.each(cases)('%j', (expr) => {
    const expected = webEvalMathExpr(expr);
    const actual = evalMathExpr(expr);
    if (Number.isNaN(expected)) expect(actual).toBeNaN();
    else expect(actual).toBe(expected);
  });

  it('random expressions from the allowed characters match the web', () => {
    const parts = ['1', '2', '0.5', '.5', '1e2', 'sqrt(', '(', ')', '+', '-'];
    const ops = ['*', '/', '**', 'e', ' ', '.', '0'];
    const alphabet = [...parts, ...ops];
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    const mismatches: string[] = [];
    for (let n = 0; n < 20000; n++) {
      let s = '';
      const len = 1 + (rand() % 8);
      for (let i = 0; i < len; i++) s += alphabet[rand() % alphabet.length];
      const expected = webEvalMathExpr(s);
      const actual = evalMathExpr(s);
      if (!Object.is(expected, actual)) mismatches.push(s);
    }
    expect(mismatches).toEqual([]);
  });

  it.each(['/3/**0', '/3/.test(3)+1', '/(.*)*q/.test(/1111111111/)'])(
    'a regex literal (%j) is never run: NaN (the web may give a number)',
    (expr) => {
      expect(evalMathExpr(expr)).toBeNaN();
    },
  );
});
