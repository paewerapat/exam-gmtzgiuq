// Quick test for normalizeMathAnswer logic
function normalizeMathAnswer(s) {
  let t = s.trim();
  t = t.replace(/^\$\$?([\s\S]*?)\$\$?$/, '$1').trim();
  // sqrt BEFORE frac
  t = t.replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)');
  t = t.replace(/\\sqrt\s+(\S+)/g, 'sqrt($1)');
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
  t = t.replace(/\\left|\\right/g, '');
  t = t.replace(/\\\s*/g, '');
  t = t.replace(/\{|\}/g, '');
  t = t.replace(/√(\d+(?:\.\d+)?)/g, 'sqrt($1)');
  t = t.replace(/√\(([^)]+)\)/g, 'sqrt($1)');
  t = t.replace(/√/g, 'sqrt');
  t = t.replace(/sqrt(\d+(?:\.\d+)?)/g, 'sqrt($1)');
  t = t.replace(/×/g, '*');
  t = t.replace(/÷/g, '/');
  t = t.replace(/−/g, '-');
  t = t.replace(/[^\S ]+/g, '');
  t = t.replace(/\s+/g, '');
  return t.toLowerCase();
}

function evalMathExpr(expr) {
  if (!/^[0-9+\-*/().sqrteSQRTE\s]+$/.test(expr)) return NaN;
  try {
    const safe = expr.replace(/sqrt\(/gi, 'Math.sqrt(');
    return Function('"use strict"; return (' + safe + ')')();
  } catch { return NaN; }
}

function isAnswerCorrect(correctAnswer, userAnswer) {
  const ua = parseFloat(userAnswer.trim());
  const ca = parseFloat(correctAnswer.trim());
  if (!isNaN(ua) && !isNaN(ca)) return Math.abs(ua - ca) < 1e-9;

  const normUser = normalizeMathAnswer(userAnswer);
  const normCorrect = normalizeMathAnswer(correctAnswer);
  if (normUser === normCorrect) return true;

  const evalUser = evalMathExpr(normUser);
  const evalCorrect = evalMathExpr(normCorrect);
  if (!isNaN(evalUser) && !isNaN(evalCorrect)) {
    return Math.abs(evalUser - evalCorrect) < 1e-9;
  }
  return false;
}

const cases = [
  // [correctAnswer, userAnswer, expectedPass]
  ['\\frac{\\sqrt{3}}{3}', 'sqrt(3)/3',               true],
  ['\\frac{\\sqrt{3}}{3}', '√3/3',                    true],
  ['\\frac{\\sqrt{3}}{3}', '1/sqrt(3)',                true],
  ['\\frac{\\sqrt{3}}{3}', '\\frac{\\sqrt{3}}{3}',    true],
  ['\\frac{\\sqrt{3}}{3}', '\\frac{1}{\\sqrt{3}}',    true],
  ['\\frac{\\sqrt{3}}{2}', 'sqrt(3)/2',               true],
  ['\\frac{\\sqrt{3}}{2}', '√3/2',                    true],
  ['\\frac{\\sqrt{3}}{2}', 'sqrt(3)/3',               false], // wrong answer
  ['4',                    '4',                        true],
  ['4',                    '4.0',                      true],
  ['4',                    'sqrt(16)',                 true],
  ['\\frac{1}{2}',         '0.5',                     true],
  ['\\frac{1}{2}',         '1/2',                     true],
];

const SUPERSCRIPT = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','n':'ⁿ','a':'ᵃ','b':'ᵇ','x':'ˣ','y':'ʸ','z':'ᶻ','k':'ᵏ','m':'ᵐ'};
function toSup(s) { return s.split('').map(c => SUPERSCRIPT[c] ?? c).join(''); }
function prettyMathAnswer(s) {
  let t = s.trim();
  t = t.replace(/^\$\$?([\s\S]*?)\$\$?$/, '$1').trim();
  t = t.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');
  t = t.replace(/\\sqrt\s+(\S+)/g, '√($1)');
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
  t = t.replace(/\\left|\\right/g, '');
  t = t.replace(/\\\s*/g, '');
  t = t.replace(/\{|\}/g, '');
  t = t.replace(/sqrt\((\d+(?:\.\d+)?)\)/gi, '√$1');
  t = t.replace(/sqrt\(([^)]+)\)/gi, '√($1)');
  t = t.replace(/sqrt(\d+(?:\.\d+)?)/gi, '√$1');
  t = t.replace(/\^\{([^}]+)\}/g, (_, exp) => toSup(exp));
  t = t.replace(/\^(\d+)/g, (_, exp) => toSup(exp));
  t = t.replace(/\^([a-zA-Z])/g, (_, c) => toSup(c));
  t = t.replace(/√\((\w+)\)/g, '√$1');
  t = t.replace(/\/\((\w+(?:\.\d+)?)\)/g, '/$1');
  t = t.replace(/\((\w+(?:\.\d+)?)\)\//g, '$1/');
  t = t.replace(/\*/g, '×');
  t = t.replace(/−/g, '-');
  return t;
}

const prettyTests = [
  ['sqrt(3)/3',            '√3/3'],
  ['√3/3',                 '√3/3'],
  ['1/sqrt(3)',             '1/√3'],
  ['\\frac{\\sqrt{3}}{3}', '(√3)/3'],
  ['x^2',                  'x²'],
  ['x^{2}',                'x²'],
  ['2*3',                  '2×3'],
  ['a^2 + b^2',            'a² + b²'],
  ['x^n',                  'xⁿ'],
];
console.log('\n── prettyMathAnswer tests ──');
let pp = 0, pf = 0;
for (const [input, expected] of prettyTests) {
  const got = prettyMathAnswer(input);
  const ok = got === expected;
  if (ok) pp++; else pf++;
  console.log(`${ok?'✅':'❌'} "${input}" → "${got}" (expected "${expected}")`);
}
console.log(`${pp}/${pp+pf} passed`);

let pass = 0, fail = 0;
for (const [correct, user, expected] of cases) {
  const result = isAnswerCorrect(correct, user);
  const ok = result === expected;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '✅' : '❌'} correct="${correct}" | user="${user}" | expected=${expected} got=${result}`);
}
console.log(`\n${pass}/${pass+fail} passed`);
