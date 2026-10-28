// 未绑定邮箱时的提醒：开自动评课、保存学校凭据等长期托管场景使用
import React from "react";
import { Link } from "react-router-dom";
import { Alert } from "@/components/ui.jsx";
import { useAuth } from "@/lib/api.jsx";

export default function EmailBindHint() {
  const { user } = useAuth();
  if (!user || user.email_verified) return null;
  return (
    <Alert variant="warning" title="建议绑定邮箱">
      <span>
        还没有绑定邮箱。忘记平台密码时只能靠邮箱找回，否则这里的任务就没法自己管理了。
        <Link to="/account" className="ml-1">去绑定</Link>
      </span>
    </Alert>
  );
}
