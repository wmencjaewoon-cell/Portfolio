"use client";

import { useParams } from "next/navigation";
import PortfolioEditor from "../shared/PortfolioEditor";

export default function AdminPortfolioEditPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  if (!id || typeof id !== "string") {
    return (
      <main style={{ maxWidth: 1040, margin: "40px auto", padding: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>포트폴리오 수정</h1>
        <p style={{ marginTop: 12, color: "#666" }}>잘못된 접근입니다.</p>
      </main>
    );
  }

  return <PortfolioEditor editId={id} />;
}