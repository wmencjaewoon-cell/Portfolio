"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // 매직링크가 여기로 오면 supabase-js가 URL을 보고 세션을 잡습니다.
    // 세션이 잡혔는지만 확인하고 이동합니다.
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/admin/portfolio/new");
        return;
      }

      // 혹시 바로 안 잡히면 잠깐 뒤 재확인
      setTimeout(async () => {
        const { data: d2 } = await supabase.auth.getSession();
        if (d2.session) router.replace("/admin/portfolio/new");
        else router.replace("/"); // 실패 시 홈으로
      }, 500);
    })();
  }, [router]);

  return <div style={{ padding: 20 }}>로그인 처리 중…</div>;
}