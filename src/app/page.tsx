"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    const e = email.trim();
    if (!e) return alert("이메일을 입력하세요.");

    const emailRedirectTo = `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: { emailRedirectTo },
    });

    if (error) return alert(error.message);
    alert("로그인 링크를 이메일로 보냈습니다.");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const goAdmin = () => router.push("/admin/portfolio/new");

  const goList = () => router.push("/admin/portfolio");
  const goNew = () => router.push("/admin/portfolio/new");

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Portfolio Admin</h1>

      {!session ? (
        <section style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "#666" }}>관리자 이메일로 로그인 링크를 받습니다.</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@company.com"
            style={{ width: "100%", border: "1px solid #ddd", borderRadius: 12, padding: "10px 12px", marginTop: 10 }}
          />
          <button
            onClick={signIn}
            style={{ marginTop: 10, border: "1px solid #111", borderRadius: 12, padding: "10px 12px", fontWeight: 800 }}
          >
            로그인 링크 보내기
          </button>
        </section>
      ) : (
        <section style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: "#666" }}>로그인됨</div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              onClick={goAdmin}
              style={{ border: "1px solid #111", borderRadius: 12, padding: "10px 12px", fontWeight: 800 }}
            >
              포트폴리오 작성하기
            </button>
            <button onClick={goList}>포트폴리오 관리(목록)</button>
            <button onClick={goNew}>포트폴리오 작성하기</button>
            <button
              onClick={signOut}
              style={{ border: "1px solid #ddd", borderRadius: 12, padding: "10px 12px", fontWeight: 800 }}
            >
              로그아웃
            </button>
          </div>
        </section>
      )}
    </main>
  );
}