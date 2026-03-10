"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseBrowser";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    (async () => {
      try {
        const code = searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("exchangeCodeForSession error:", error);
            router.replace("/");
            return;
          }
        }

        const { data } = await supabase.auth.getSession();

        if (data.session) {
          router.replace("/admin/portfolio");
        } else {
          router.replace("/");
        }
      } catch (e) {
        console.error("auth callback error:", e);
        router.replace("/");
      }
    })();
  }, [router, searchParams]);

  return <div style={{ padding: 20 }}>로그인 처리 중…</div>;
}