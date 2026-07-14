// PreToolUse hook: develop/main 보호 브랜치 규칙 강제.
//  - 보호 브랜치 위에서의 git commit 차단
//  - 보호 브랜치 위에서의 refspec 없는 git push(현재 브랜치 push) 차단
//  - 조직 저장소(upstream)의 develop/main으로의 직접 push 차단
// 규칙 원본: docs/strategy/branch_strategy.md, docs/strategy/pr_strategy.md
const { execSync } = require('child_process');

const PROTECTED = ['develop', 'main'];

function deny(reason) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
}

function currentBranch() {
  try {
    return execSync('git branch --show-current', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return null; // git 저장소가 아니면 검사하지 않음
  }
}

// "git push ..." 세그먼트에서 flag가 아닌 인자(remote, refspec)를 추출
function pushArgs(segment) {
  const m = segment.match(/\bgit\b(?:\s+\S+)*?\s+push\b(.*)$/);
  if (!m) return null;
  return m[1]
    .trim()
    .split(/\s+/)
    .filter((t) => t && !t.startsWith('-'));
}

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let cmd = '';
  try {
    cmd = JSON.parse(input).tool_input.command || '';
  } catch {
    return;
  }
  if (!/\bgit\b/.test(cmd)) return;

  const branch = currentBranch();
  if (branch === null) return;
  const onProtected = PROTECTED.includes(branch);

  // 셸 연산자 기준으로 분리해 세그먼트별로 검사
  for (const seg of cmd.split(/&&|\|\||;|\n/)) {
    if (onProtected && /\bgit\b(?:\s+\S+)*?\s+commit\b/.test(seg)) {
      return deny(
        `보호 브랜치(${branch})에서는 커밋할 수 없습니다. ` +
          `docs/strategy/branch_strategy.md에 따라 작업 브랜치(feature/*, fix/*, docs/* 등)를 만들어 작업하고 PR로 병합하세요.`,
      );
    }

    const args = pushArgs(seg);
    if (!args) continue;
    const [remote, ...refspecs] = args;

    // refspec 없이 push → 현재 브랜치가 push됨
    if (onProtected && refspecs.length === 0) {
      return deny(
        `보호 브랜치(${branch})를 직접 push할 수 없습니다. PR을 통해서만 병합하세요 (docs/strategy/pr_strategy.md).`,
      );
    }

    // 조직 저장소(upstream)의 develop/main으로 직접 push (포크 origin 동기화 push는 허용)
    if (
      remote === 'upstream' &&
      refspecs.some((r) => PROTECTED.includes(r.split(':').pop()))
    ) {
      return deny(
        `조직 저장소(upstream)의 develop/main으로 직접 push는 금지입니다. PR을 통해서만 병합하세요 (docs/strategy/pr_strategy.md).`,
      );
    }
  }
});
