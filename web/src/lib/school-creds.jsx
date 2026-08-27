/**
 * 学校账号密码的本机保存（localStorage 明文）。
 * 仅在用户勾选“记住学号和密码”且登录成功时写入；取消勾选立即删除。
 * 三个交互式学校登录页（课表/成绩/选课）共用同一份，实现“一次保存，处处填入”。
 */

const KEY = "nanyee:school-creds";

/** 返回 { account, password } 或 null */
export function loadSchoolCreds() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data?.account === "string" && typeof data?.password === "string" && data.account) {
      return { account: data.account, password: data.password };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSchoolCreds(account, password) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ account, password }));
  } catch { /* 隐私模式等场景写入失败时静默降级 */ }
}

export function clearSchoolCreds() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
