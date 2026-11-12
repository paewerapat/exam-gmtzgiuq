/**
 * Server copy of the answer checking in the web app
 * (exam-web-gmtzgiuq/lib/exam-utils.ts: parseChoiceAnswer, getCorrectChoiceIds,
 * normalizeMathAnswer, isAnswerCorrect, getAnswerStatus), used to fill
 * question_answers.isCorrect (task 16). Keep both in step: a change to the
 * web grading must be made here too (answer-grading.spec.ts mirrors the web
 * test cases).
 *
 * One deliberate difference: the web evaluates a short math answer with
 * `new Function`. The server never runs user input as code (a regex literal
 * such as `/(.*)*q/.test(...)` passes the web's character filter and could
 * block the event loop), so evalMathExpr below is a small parser for the
 * same JavaScript subset: numbers, + - * / **, unary + -, parentheses and
 * sqrt(...). Inputs that only evaluate to a number through other JavaScript
 * features (regex literals, property access such as `sqrt(4).e**0`) give NaN
 * here; no real answer is written that way.
 */

export type GradableQuestion = {
  type?: string | null;
  correctAnswer?: string | null;
  choices?: { id: string; isCorrect?: boolean | null }[] | null;
};

/** "b,c,d" / "c" → sorted unique ids, empty parts dropped. */
export function parseChoiceAnswer(answer: string | null | undefined): string[] {
  if (!answer) return [];
  return [
    ...new Set(
      answer
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].sort();
}

/** Ids of every correct choice, in choice order. */
export function getCorrectChoiceIds(
  question: Pick<GradableQuestion, 'choices'>,
): string[] {
  return (Array.isArray(question.choices) ? question.choices : [])
    .filter((c) => c?.isCorrect)
    .map((c) => c.id);
}

/** Every type except short_answer is answered by picking choices. */
function isChoiceQuestion(question: Pick<GradableQuestion, 'type'>): boolean {
  return question.type !== 'short_answer';
}

/**
 * Normalize a math answer string so equivalent forms compare equal
 * (same steps as the web).
 */
export function normalizeMathAnswer(s: string): string {
  let t = s.trim();

  // Strip outer $ delimiters  ($...$  or  $$...$$)
  t = t.replace(/^\$\$?([\s\S]*?)\$\$?$/, '$1').trim();

  // LaTeX → plain text  (sqrt MUST come before frac)
  t = t.replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)');
  t = t.replace(/\\sqrt\s+(\S+)/g, 'sqrt($1)');
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
  t = t.replace(/\\left|\\right/g, '');
  t = t.replace(/\\\s*/g, ''); // remaining backslash commands
  t = t.replace(/\{|\}/g, ''); // stray braces

  // Unicode symbols → ascii  (√3 → sqrt(3), √(x) → sqrt(x))
  t = t.replace(/√(\d+(?:\.\d+)?)/g, 'sqrt($1)');
  t = t.replace(/√\(([^)]+)\)/g, 'sqrt($1)');
  t = t.replace(/√/g, 'sqrt'); // fallback

  // Ensure bare sqrt followed by digits gets parens: sqrt3 → sqrt(3)
  t = t.replace(/sqrt(\d+(?:\.\d+)?)/g, 'sqrt($1)');
  t = t.replace(/×/g, '*');
  t = t.replace(/÷/g, '/');
  t = t.replace(/−/g, '-'); // Unicode minus
  t = t.replace(/[^\S ]+/g, ''); // non-space whitespace
  t = t.replace(/\s+/g, ''); // collapse spaces

  return t.toLowerCase();
}

/** Thrown where JavaScript would throw (SyntaxError, ReferenceError, ...). */
class MathSyntaxError extends Error {}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'op'; value: string }
  | { kind: 'sqrt' }
  | { kind: 'ident' }
  | { kind: 'member' };

// JavaScript DecimalLiteral, plus the strict-mode rule that an integer part
// with a leading 0 (01, 08) is a SyntaxError.
const NUMBER_PATTERN = /^(?:(\d+)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const OPERATORS = ['**', '++', '--', '+', '-', '*', '/', '(', ')'];

/** \n, \r, U+2028, U+2029 (end a // comment in JavaScript). */
function isLineTerminator(code: number): boolean {
  return code === 0x0a || code === 0x0d || code === 0x2028 || code === 0x2029;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Comments are whitespace in JavaScript
    if (expr.startsWith('/*', i)) {
      const end = expr.indexOf('*/', i + 2);
      if (end < 0) throw new MathSyntaxError();
      i = end + 2;
      continue;
    }
    if (expr.startsWith('//', i)) {
      let end = i + 2;
      while (end < expr.length && !isLineTerminator(expr.charCodeAt(end))) {
        end++;
      }
      i = end;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const match = NUMBER_PATTERN.exec(expr.slice(i));
      if (match) {
        if (match[1] && match[1].length > 1 && match[1][0] === '0') {
          throw new MathSyntaxError();
        }
        // An identifier or digit right after a number is a SyntaxError
        if (/^[A-Za-z0-9_$]/.test(expr.slice(i + match[0].length))) {
          throw new MathSyntaxError();
        }
        tokens.push({ kind: 'num', value: Number(match[0]) });
        i += match[0].length;
        continue;
      }
      // "." not starting a number: property access (.name) or SyntaxError
      const name = /^\.([A-Za-z_$][A-Za-z0-9_$]*)/.exec(expr.slice(i));
      if (!name) throw new MathSyntaxError();
      tokens.push({ kind: 'member' });
      i += name[0].length;
      continue;
    }
    const ident = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(expr.slice(i));
    if (ident) {
      // The web turns "sqrt(" (any case) into "Math.sqrt("; any other name
      // is an undefined variable
      const isSqrt =
        ident[0].toLowerCase() === 'sqrt' && expr[i + ident[0].length] === '(';
      tokens.push(isSqrt ? { kind: 'sqrt' } : { kind: 'ident' });
      i += ident[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => expr.startsWith(o, i));
    if (!op) throw new MathSyntaxError();
    tokens.push({ kind: 'op', value: op });
    i += op.length;
  }
  return tokens;
}

/**
 * Recursive-descent evaluation with JavaScript precedence and semantics:
 * additive < multiplicative < exponent (right-associative, a unary operand
 * on its left is a SyntaxError) < unary < call/member < primary.
 */
class MathEvaluator {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  run(): number {
    const value = this.additive();
    if (this.pos !== this.tokens.length) throw new MathSyntaxError();
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private isOp(value: string): boolean {
    const token = this.peek();
    return token?.kind === 'op' && token.value === value;
  }

  private additive(): number {
    let value = this.multiplicative();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.tokens[this.pos++] as { value: string }).value;
      const right = this.multiplicative();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  private multiplicative(): number {
    let value = this.exponent();
    while (this.isOp('*') || this.isOp('/')) {
      const op = (this.tokens[this.pos++] as { value: string }).value;
      const right = this.exponent();
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }

  private exponent(): number {
    if (this.isOp('+') || this.isOp('-')) {
      const value = this.unary();
      if (this.isOp('**')) throw new MathSyntaxError();
      return value;
    }
    const base = this.postfix();
    if (this.isOp('**')) {
      this.pos++;
      return base ** this.exponent();
    }
    return base;
  }

  private unary(): number {
    if (this.isOp('+')) {
      this.pos++;
      return +this.unary();
    }
    if (this.isOp('-')) {
      this.pos++;
      return -this.unary();
    }
    return this.postfix();
  }

  /** Primary, then property access; a call or ++/-- on a value throws. */
  private postfix(): number {
    let value = this.primary();
    for (;;) {
      const token = this.peek();
      if (token?.kind === 'member') {
        // No property of a number (or of Math.sqrt's result) has a name made
        // of the letters the web allows: undefined, i.e. NaN in arithmetic
        this.pos++;
        value = NaN;
        continue;
      }
      if (
        token?.kind === 'op' &&
        (token.value === '(' || token.value === '++' || token.value === '--')
      ) {
        throw new MathSyntaxError();
      }
      return value;
    }
  }

  private primary(): number {
    const token = this.tokens[this.pos++];
    if (!token) throw new MathSyntaxError();
    if (token.kind === 'num') return token.value;
    if (token.kind === 'sqrt') {
      this.pos++; // "("
      if (this.isOp(')')) {
        this.pos++;
        return Math.sqrt(NaN); // Math.sqrt() is NaN
      }
      const arg = this.additive();
      if (!this.isOp(')')) throw new MathSyntaxError();
      this.pos++;
      return Math.sqrt(arg);
    }
    if (token.kind === 'op' && token.value === '(') {
      const value = this.additive();
      if (!this.isOp(')')) throw new MathSyntaxError();
      this.pos++;
      return value;
    }
    // Undefined variable, regex literal, ++/--, stray operator
    throw new MathSyntaxError();
  }
}

/**
 * Evaluate a simple math expression (web: evalMathExpr) without running it as
 * code. NaN when it is not parseable or uses anything outside the subset.
 */
export function evalMathExpr(expr: string): number {
  // Only allow safe characters (same filter as the web)
  if (!/^[0-9+\-*/().sqrteSQRTE\s]+$/.test(expr)) return NaN;
  try {
    // The web runs "return (" + expr + ")": the parentheses take part in
    // parsing ("3)*(2" is valid, "1//2" comments out the closing one)
    return new MathEvaluator(tokenize(`(${expr})`)).run();
  } catch {
    return NaN;
  }
}

/** Same result as the web's isAnswerCorrect (MC all-or-none, short answer). */
export function isAnswerCorrect(
  question: GradableQuestion,
  userAnswer: string,
): boolean {
  if (question.type === 'short_answer') {
    if (!question.correctAnswer) return false;

    // 1. Numeric comparison (plain numbers)
    const ua = parseFloat(userAnswer.trim());
    const ca = parseFloat(question.correctAnswer.trim());
    if (!isNaN(ua) && !isNaN(ca)) return Math.abs(ua - ca) < 1e-9;

    // 2. Normalize both sides
    const normUser = normalizeMathAnswer(userAnswer);
    const normCorrect = normalizeMathAnswer(question.correctAnswer);

    // 3. String match after normalization
    if (normUser === normCorrect) return true;

    // 4. Numeric evaluation of normalized expressions
    const evalUser = evalMathExpr(normUser);
    const evalCorrect = evalMathExpr(normCorrect);
    if (!isNaN(evalUser) && !isNaN(evalCorrect)) {
      return Math.abs(evalUser - evalCorrect) < 1e-9;
    }

    return false;
  }
  // Choices: the picked set must equal the correct set (all-or-none)
  const selected = parseChoiceAnswer(userAnswer);
  const correct = parseChoiceAnswer(getCorrectChoiceIds(question).join(','));
  if (selected.length === 0 || correct.length === 0) return false;
  return (
    selected.length === correct.length &&
    selected.every((id, i) => id === correct[i])
  );
}

export type AnswerStatus = 'correct' | 'incorrect' | 'unanswered';

/**
 * web getAnswerStatus: empty answer, or a choice answer with no choice left
 * ("" or ","), is unanswered.
 */
export function getAnswerStatus(
  question: GradableQuestion,
  userAnswer: string | null | undefined,
): AnswerStatus {
  if (!userAnswer) return 'unanswered';
  if (isChoiceQuestion(question) && parseChoiceAnswer(userAnswer).length === 0)
    return 'unanswered';
  return isAnswerCorrect(question, userAnswer) ? 'correct' : 'incorrect';
}
