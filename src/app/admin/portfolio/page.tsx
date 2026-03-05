"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  title: string | null;
  is_published: boolean;
  created_at: string | null;
};

export default function AdminPortfolioListPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("portfolio_posts")
        .select("id,title,is_published,created_at")
        .order("created_at", { ascending: false });

      if (error) {
        alert(error.message);
        setRows([]);
      } else {
        setRows((data as any) ?? []);
      }
      setLoading(false);
    })();
  }, [session]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => (r.title ?? "").toLowerCase().includes(s));
  }, [rows, q]);

  if (!session) {
    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Admin / Portfolio</h1>
        <p style={{ marginTop: 10, color: "#666" }}>로그인이 필요합니다. (Home에서 로그인 후 이용)</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>포트폴리오 목록</h1>
        <button
          onClick={() => router.push("/admin/portfolio/new")}
          style={{ border: "1px solid #111", borderRadius: 12, padding: "10px 12px", fontWeight: 800 }}
        >
          + 새로 작성
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목 검색"
          style={{ width: "100%", border: "1px solid #ddd", borderRadius: 12, padding: "10px 12px" }}
        />
      </div>

      {loading ? (
        <div style={{ marginTop: 20, color: "#666" }}>불러오는 중...</div>
      ) : (
        <div style={{ marginTop: 16, border: "1px solid #eee", borderRadius: 14, overflow: "hidden" }}>
          {filtered.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 14px",
                borderTop: "1px solid #eee",
                cursor: "pointer",
              }}
              onClick={() => router.push(`/admin/portfolio/${r.id}`)}
            >
              <div style={{ fontWeight: 800 }}>{r.title ?? "(제목 없음)"}</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", color: "#666", fontSize: 13 }}>
                <span>{r.is_published ? "게시중" : "비공개"}</span>
                <span>{r.created_at ? new Date(r.created_at).toLocaleDateString() : "-"}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 16, color: "#666" }}>데이터가 없습니다.</div>
          )}
        </div>
      )}
    </main>
  );
}