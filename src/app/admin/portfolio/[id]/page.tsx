"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseBrowser";

type Post = {
  id: string;
  title: string | null;
  description: string | null;
  is_published: boolean;

  region_sido: string | null;
  region_sigungu: string | null;

  contractor_name: string | null;
  start_date: string | null;
  end_date: string | null;

  total_cost: number | null;

  youtube_url: string | null;
  video_storage_path: string | null;
};

type LoadedImgRow = { storage_path: string; sort_order: number };

type TagJoinRow = { tags: { name: string } | null };

type CostRow = { category: string; amount: number; note: string };
type LoadedCostRow = { category: string | null; amount: number | null; note: string | null };

function publicUrl(bucket: string, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function parseTags(s: string) {
  return Array.from(new Set(s.split(",").map((v) => v.trim()).filter(Boolean)));
}

function isValidYouTubeUrl(url: string) {
  const u = url.trim();
  if (!u) return true;
  return /youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/shorts\//i.test(u);
}

// 드래그 재정렬 helper
function reorder<T>(arr: T[], from: number, to: number) {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function AdminPortfolioEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [post, setPost] = useState<Post | null>(null);

  // ===== 비용/태그 =====
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [tagsInput, setTagsInput] = useState("");

  // ===== 이미지(기존 + 신규) =====
  const [existingImages, setExistingImages] = useState<
    Array<{ storage_path: string; sort_order: number; url: string }>
  >([]);
  const [newImages, setNewImages] = useState<
    Array<{ file: File; sort_order: number; previewUrl: string }>
  >([]);

  // 처음 로드된 기존 이미지 경로(삭제 계산용)
  const initialExistingPathsRef = useRef<string[]>([]);

  // 드래그 인덱스
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // ===== auth =====
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ===== load =====
  useEffect(() => {
    if (!session || !id) return;

    (async () => {
      setLoading(true);

      // post
      const { data: p, error: pErr } = await supabase
        .from("portfolio_posts")
        .select(
          "id,title,description,is_published,region_sido,region_sigungu,contractor_name,start_date,end_date,total_cost,youtube_url,video_storage_path"
        )
        .eq("id", id)
        .maybeSingle();

      if (pErr || !p) {
        alert(pErr?.message ?? "글을 찾을 수 없습니다.");
        setPost(null);
        setExistingImages([]);
        setNewImages([]);
        setCosts([]);
        setTagsInput("");
        setLoading(false);
        return;
      }

      // images
      const { data: imgRows, error: iErr } = await supabase
        .from("portfolio_images")
        .select("storage_path,sort_order")
        .eq("post_id", id)
        .order("sort_order", { ascending: true });

      if (iErr) console.log(iErr);

      const imgs = ((imgRows as any) ?? []) as LoadedImgRow[];
      const ex = imgs.map((r) => ({
        storage_path: r.storage_path,
        sort_order: r.sort_order,
        url: publicUrl("portfolio-images", r.storage_path),
      }));

      initialExistingPathsRef.current = ex.map((x) => x.storage_path);

      // costs
      const { data: costRows, error: cErr } = await supabase
        .from("portfolio_cost_items")
        .select("category,amount,note")
        .eq("post_id", id)
        .order("created_at", { ascending: true });

      if (cErr) console.log(cErr);

      const loadedCosts = ((costRows as any) ?? []) as LoadedCostRow[];
      setCosts(
        loadedCosts.map((r) => ({
          category: (r.category ?? "").trim(),
          amount: Number(r.amount ?? 0) || 0,
          note: r.note ?? "",
        }))
      );

      // tags
      const { data: tagRows, error: tErr } = await supabase
        .from("portfolio_post_tags")
        .select("tags(name)")
        .eq("post_id", id);

      if (tErr) console.log(tErr);
      const t = ((tagRows as any) ?? []) as TagJoinRow[];
      const names = t.map((r) => r.tags?.name).filter(Boolean) as string[];
      setTagsInput(names.join(","));

      setPost(p as any);
      setExistingImages(ex);
      setNewImages([]);
      setLoading(false);
    })();
  }, [session, id]);

  // ===== merged images (드래그/표시용) =====
  const mergedImages = useMemo(() => {
    const ex = existingImages
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((x) => ({ kind: "existing" as const, ...x }));

    const nw = newImages
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((x) => ({ kind: "new" as const, ...x }));

    return [...ex, ...nw].sort((a: any, b: any) => a.sort_order - b.sort_order);
  }, [existingImages, newImages]);

  function normalizeAfterMerged(nextMerged: any[]) {
    const normalized = nextMerged.map((x, i) => ({ ...x, sort_order: i + 1 }));

    setExistingImages((prev) => {
      const map = new Map(prev.map((p) => [p.storage_path, p]));
      return normalized
        .filter((x) => x.kind === "existing")
        .map((x) => ({ ...(map.get(x.storage_path) as any), sort_order: x.sort_order }));
    });

    setNewImages((prev) => {
      const map = new Map(prev.map((p) => [p.previewUrl, p]));
      return normalized
        .filter((x) => x.kind === "new")
        .map((x) => ({ ...(map.get(x.previewUrl) as any), sort_order: x.sort_order }));
    });
  }

  // ===== video preview =====
  const videoUrl = useMemo(() => {
    if (!post?.video_storage_path) return "";
    return publicUrl("portfolio-images", post.video_storage_path);
  }, [post?.video_storage_path]);

  // ===== 비용 =====
  const costSum = useMemo(() => costs.reduce((s, c) => s + (Number(c.amount) || 0), 0), [costs]);

  function addCostRow() {
    setCosts((prev) => [...prev, { category: "", amount: 0, note: "" }]);
  }
  function updateCost(idx: number, patch: Partial<CostRow>) {
    setCosts((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }
  function removeCost(idx: number) {
    setCosts((prev) => prev.filter((_, i) => i !== idx));
  }

  // ===== 이미지 추가 =====
  function onPickImages(files: FileList | null) {
    if (!files || files.length === 0) return;

    setNewImages((prev) => {
      const base = existingImages.length + prev.length;
      const added = Array.from(files).map((file, i) => ({
        file,
        sort_order: base + i + 1,
        previewUrl: URL.createObjectURL(file),
      }));
      return [...prev, ...added];
    });
  }

  // ===== 이미지 제거(기존/신규) =====
  function removeExistingByPath(storage_path: string) {
    setExistingImages((prev) => prev.filter((x) => x.storage_path !== storage_path));
    // sort_order는 normalizeAfterMerged로 정리하는 버튼 or 드래그 후 정리로 맞추는게 깔끔하지만
    // 여기서는 바로 정리해주자:
    setTimeout(() => {
      const next = mergedImages.filter((m: any) => !(m.kind === "existing" && m.storage_path === storage_path));
      normalizeAfterMerged(next);
    }, 0);
  }

  function removeNewByPreview(previewUrl: string) {
    setNewImages((prev) => {
      const target = prev.find((x) => x.previewUrl === previewUrl);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((x) => x.previewUrl !== previewUrl);
    });

    setTimeout(() => {
      const next = mergedImages.filter((m: any) => !(m.kind === "new" && m.previewUrl === previewUrl));
      normalizeAfterMerged(next);
    }, 0);
  }

  // ===== 저장(전체: post + tags + costs + images) =====
  async function saveAll() {
    if (!post) return;

    if (!isValidYouTubeUrl(post.youtube_url ?? "")) {
      alert("유튜브 링크 형식을 확인해주세요.");
      return;
    }

    try {
      setSaving(true);

      // 1) posts 업데이트
      const { error: pErr } = await supabase
        .from("portfolio_posts")
        .update({
          title: post.title,
          description: post.description,
          is_published: post.is_published,
          region_sido: post.region_sido,
          region_sigungu: post.region_sigungu,
          contractor_name: post.contractor_name,
          start_date: post.start_date,
          end_date: post.end_date,
          total_cost: post.total_cost,
          youtube_url: post.youtube_url,
          video_storage_path: post.video_storage_path,
        })
        .eq("id", post.id);

      if (pErr) throw pErr;

      // 2) costs: 전체 재저장
      await supabase.from("portfolio_cost_items").delete().eq("post_id", post.id);

      const cleanedCosts = costs
        .map((c) => ({
          post_id: post.id,
          category: (c.category ?? "").trim(),
          amount: Number(c.amount) || 0,
          note: (c.note ?? "").trim() || null,
          unit: "만원",
          quantity: 1,
        }))
        .filter((c) => c.category.length > 0);

      if (cleanedCosts.length) {
        const { error: cErr } = await supabase.from("portfolio_cost_items").insert(cleanedCosts);
        if (cErr) throw cErr;
      }

      // 3) tags: 전체 재저장
      const tagArr = parseTags(tagsInput);

      await supabase.from("portfolio_post_tags").delete().eq("post_id", post.id);

      if (tagArr.length) {
        const { data: existingTags, error: exErr } = await supabase.from("tags").select("id,name").in("name", tagArr);
        if (exErr) throw exErr;

        const map = new Map<string, string>();
        for (const t of existingTags ?? []) map.set((t as any).name, (t as any).id);

        const missing = tagArr.filter((name) => !map.has(name));
        if (missing.length) {
          const { data: inserted, error: insErr } = await supabase
            .from("tags")
            .insert(missing.map((name) => ({ name })))
            .select("id,name");

          if (insErr) {
            const { data: retry, error: retryErr } = await supabase.from("tags").select("id,name").in("name", missing);
            if (retryErr) throw retryErr;
            for (const t of retry ?? []) map.set((t as any).name, (t as any).id);
          } else {
            for (const t of inserted ?? []) map.set((t as any).name, (t as any).id);
          }
        }

        const tagIds = Array.from(new Set(tagArr.map((name) => map.get(name)).filter(Boolean))) as string[];
        const links = tagIds.map((tag_id) => ({ post_id: post.id, tag_id }));

        const { error: linkErr } = await supabase
          .from("portfolio_post_tags")
          .upsert(links, { onConflict: "post_id,tag_id" } as any);

        if (linkErr) throw linkErr;
      }

      // 4) images: (삭제된 기존 파일) Storage remove + DB는 전체 delete 후 재삽입

      // 현재 남아있는 기존 이미지 경로
      const keptExistingPaths = existingImages.map((x) => x.storage_path);
      const initialExistingPaths = initialExistingPathsRef.current;

      // 저장 시점에 제거된 기존 이미지들만 storage 삭제
      const removedExistingPaths = initialExistingPaths.filter((p) => !keptExistingPaths.includes(p));

      if (removedExistingPaths.length) {
        const { error: rmErr } = await supabase.storage.from("portfolio-images").remove(removedExistingPaths);
        if (rmErr) {
          // 여기서 실패해도 DB는 저장될 수 있으니 경고만
          console.warn("storage remove (images) warn:", rmErr);
        }
      }

      // 신규 이미지 업로드
      const sortedNew = [...newImages].sort((a, b) => a.sort_order - b.sort_order);

      // 업로드 결과(새 storage_path들)
      const uploadedNew: Array<{ storage_path: string; sort_order: number }> = [];

      for (const img of sortedNew) {
        const ext = (img.file.name.split(".").pop() || "jpg").toLowerCase();
        const safeExt = ext.length <= 6 ? ext : "jpg";
        const uuid = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).toString();
        const filePath = `${post.id}/${uuid}.${safeExt}`;

        const { error: upErr } = await supabase.storage.from("portfolio-images").upload(filePath, img.file, {
          upsert: false,
          contentType: img.file.type || (safeExt === "png" ? "image/png" : "image/jpeg"),
        });
        if (upErr) throw upErr;

        uploadedNew.push({ storage_path: filePath, sort_order: img.sort_order });
      }

      // DB: portfolio_images는 전체 삭제 후 재삽입 (순서/unique 충돌 방지)
      const { error: delImgRowsErr } = await supabase.from("portfolio_images").delete().eq("post_id", post.id);
      if (delImgRowsErr) throw delImgRowsErr;

      const rowsToInsert: Array<{ post_id: string; storage_path: string; sort_order: number }> = [
        ...existingImages.map((x) => ({ post_id: post.id, storage_path: x.storage_path, sort_order: x.sort_order })),
        ...uploadedNew.map((x) => ({ post_id: post.id, storage_path: x.storage_path, sort_order: x.sort_order })),
      ].sort((a, b) => a.sort_order - b.sort_order);

      if (rowsToInsert.length) {
        const { error: insErr } = await supabase.from("portfolio_images").insert(rowsToInsert);
        if (insErr) throw insErr;
      }

      // 업로드된 신규를 existing으로 합쳐서 화면 갱신 + 초기값 ref 재설정
      const refreshedExisting = [
        ...existingImages.map((x) => x),
        ...uploadedNew.map((x) => ({
          storage_path: x.storage_path,
          sort_order: x.sort_order,
          url: publicUrl("portfolio-images", x.storage_path),
        })),
      ].sort((a, b) => a.sort_order - b.sort_order);

      initialExistingPathsRef.current = refreshedExisting.map((x) => x.storage_path);
      setExistingImages(refreshedExisting);

      // newImages 정리(메모리 revoke)
      setNewImages((prev) => {
        prev.forEach((x) => URL.revokeObjectURL(x.previewUrl));
        return [];
      });

      alert("저장 완료");
      router.push("/admin/portfolio");
      router.refresh();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || e?.details || "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  // ===== 게시글 삭제(DB + Storage) =====
  async function onDeletePost() {
    if (!post?.id) return;

    const ok = confirm("정말 삭제할까요?\n(이미지/영상 파일 포함, 되돌릴 수 없습니다)");
    if (!ok) return;

    try {
      setSaving(true);

      // 1) 현재 DB 기준으로 이미지 경로/영상 경로를 다시 가져오기(정확성)
      const { data: imgRows, error: imgErr } = await supabase
        .from("portfolio_images")
        .select("storage_path")
        .eq("post_id", post.id);

      if (imgErr) throw imgErr;

      const { data: pRow, error: pErr } = await supabase
        .from("portfolio_posts")
        .select("video_storage_path")
        .eq("id", post.id)
        .maybeSingle();

      if (pErr) throw pErr;

      const imagePaths = (imgRows ?? []).map((r: any) => r.storage_path).filter(Boolean) as string[];
      const videoPath = (pRow as any)?.video_storage_path as string | null;

      // 2) 관계 테이블 삭제
      await supabase.from("portfolio_post_tags").delete().eq("post_id", post.id);
      await supabase.from("portfolio_cost_items").delete().eq("post_id", post.id);
      await supabase.from("portfolio_images").delete().eq("post_id", post.id);

      // 3) posts 삭제
      const { error: delErr } = await supabase.from("portfolio_posts").delete().eq("id", post.id);
      if (delErr) throw delErr;

      // 4) 스토리지 삭제 (이미지 + 영상)
      const removePaths = [...imagePaths, ...(videoPath ? [videoPath] : [])];
      if (removePaths.length) {
        const { error: rmErr } = await supabase.storage.from("portfolio-images").remove(removePaths);
        if (rmErr) console.warn("storage remove warn:", rmErr);
      }

      alert("삭제 완료");
      router.push("/admin/portfolio");
      router.refresh();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || e?.details || "삭제 실패");
    } finally {
      setSaving(false);
    }
  }

  // ===== 화면 =====
  if (!session) {
    return (
      <main style={{ maxWidth: 980, margin: "40px auto", padding: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>수정</h1>
        <p style={{ marginTop: 10, color: "#666" }}>로그인이 필요합니다.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 980, margin: "40px auto", padding: 16 }}>
        <div style={{ color: "#666" }}>불러오는 중...</div>
      </main>
    );
  }

  if (!post) {
    return (
      <main style={{ maxWidth: 980, margin: "40px auto", padding: 16 }}>
        <div style={{ color: "#666" }}>데이터 없음</div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 980, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>포트폴리오 수정</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => router.push("/admin/portfolio")}
            style={{ border: "1px solid #ddd", borderRadius: 12, padding: "10px 12px", fontWeight: 800 }}
          >
            목록
          </button>

          <button
            disabled={saving}
            onClick={saveAll}
            style={{ border: "1px solid #111", borderRadius: 12, padding: "10px 12px", fontWeight: 800 }}
          >
            {saving ? "저장중..." : "저장"}
          </button>

          <button
            disabled={saving}
            onClick={onDeletePost}
            style={{
              border: "1px solid #ff3b30",
              color: "#ff3b30",
              borderRadius: 12,
              padding: "10px 12px",
              fontWeight: 800,
            }}
          >
            삭제
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {/* 기본 */}
        <Field label="제목">
          <input
            value={post.title ?? ""}
            onChange={(e) => setPost({ ...post, title: e.target.value })}
            style={styles.input}
          />
        </Field>

        <Field label="설명">
          <textarea
            value={post.description ?? ""}
            onChange={(e) => setPost({ ...post, description: e.target.value })}
            rows={6}
            style={styles.textarea}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="시/도">
            <input
              value={post.region_sido ?? ""}
              onChange={(e) => setPost({ ...post, region_sido: e.target.value })}
              style={styles.input}
            />
          </Field>
          <Field label="시/군/구">
            <input
              value={post.region_sigungu ?? ""}
              onChange={(e) => setPost({ ...post, region_sigungu: e.target.value })}
              style={styles.input}
            />
          </Field>
        </div>

        <Field label="시공사">
          <input
            value={post.contractor_name ?? ""}
            onChange={(e) => setPost({ ...post, contractor_name: e.target.value })}
            style={styles.input}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="시작일">
            <input
              value={post.start_date ?? ""}
              onChange={(e) => setPost({ ...post, start_date: e.target.value })}
              placeholder="YYYY-MM-DD"
              style={styles.input}
            />
          </Field>
          <Field label="종료일">
            <input
              value={post.end_date ?? ""}
              onChange={(e) => setPost({ ...post, end_date: e.target.value })}
              placeholder="YYYY-MM-DD"
              style={styles.input}
            />
          </Field>
        </div>

        <Field label="총 비용(만원)">
          <input
            value={post.total_cost ?? ""}
            onChange={(e) => setPost({ ...post, total_cost: e.target.value ? Number(e.target.value) : null })}
            style={styles.input}
          />
          <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
            비용 상세 합계(자동): <b>{costSum.toLocaleString()}</b> 만원
          </div>
        </Field>

        <Field label="게시 여부 (is_published)">
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={!!post.is_published}
              onChange={(e) => setPost({ ...post, is_published: e.target.checked })}
            />
            <span style={{ fontSize: 14 }}>{post.is_published ? "게시중" : "비공개"}</span>
          </label>
        </Field>

        <hr style={{ borderColor: "#eee" }} />

        {/* 영상 */}
        <Field label="유튜브 링크(선택)">
          <input
            value={post.youtube_url ?? ""}
            onChange={(e) => setPost({ ...post, youtube_url: e.target.value })}
            placeholder="https://youtu.be/..."
            style={styles.input}
          />
          {!isValidYouTubeUrl(post.youtube_url ?? "") && (
            <div style={{ color: "#c00", fontSize: 12, marginTop: 6 }}>유튜브 링크 형식을 확인해주세요.</div>
          )}
        </Field>

        <Field label="영상 storage path (portfolio-images 버킷)">
          <input
            value={post.video_storage_path ?? ""}
            onChange={(e) => setPost({ ...post, video_storage_path: e.target.value })}
            placeholder={`${post.id}/video.mp4`}
            style={styles.input}
          />
          {videoUrl ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>영상 미리보기</div>
              <video
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                style={{ width: "100%", borderRadius: 12, background: "#000" }}
              />
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>URL: {videoUrl}</div>
            </div>
          ) : null}
        </Field>

        <hr style={{ borderColor: "#eee" }} />

        {/* 태그 */}
        <Field label="태그(쉼표)">
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="예: 미니멀,화이트,카페"
            style={styles.input}
          />
        </Field>

        {/* 비용 상세 */}
        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 900 }}>비용 상세(만원)</div>
            <button onClick={addCostRow} style={styles.btn}>
              + 공종 추가
            </button>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {costs.map((c, idx) => (
              <div key={idx} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
                <input
                  value={c.category}
                  onChange={(e) => updateCost(idx, { category: e.target.value })}
                  placeholder="공종(철거/목공/전기...)"
                  style={styles.input}
                />
                <input
                  value={String(c.amount ?? 0)}
                  onChange={(e) => updateCost(idx, { amount: Number(e.target.value) || 0 })}
                  placeholder="금액(만원)"
                  inputMode="numeric"
                  style={styles.input}
                />
                <input
                  value={c.note ?? ""}
                  onChange={(e) => updateCost(idx, { note: e.target.value })}
                  placeholder="메모(선택)"
                  style={styles.input}
                />
                <button onClick={() => removeCost(idx)} style={{ ...styles.btn, borderColor: "#ddd" }}>
                  삭제
                </button>
              </div>
            ))}
            {costs.length === 0 && <div style={{ fontSize: 13, color: "#666" }}>비용 상세가 없습니다.</div>}
          </div>
        </div>

        {/* ✅ 이미지: 추가/삭제/재정렬 */}
        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900 }}>사진 (추가/삭제/순서변경)</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input type="file" accept="image/*" multiple onChange={(e) => onPickImages(e.target.files)} />
              <button
                type="button"
                onClick={() => normalizeAfterMerged(mergedImages)}
                style={styles.btn}
                title="현재 순서대로 1..N 정리"
              >
                순서 정리
              </button>
              <div style={{ fontSize: 12, color: "#666" }}>
                총 <b>{mergedImages.length}</b>장 (기존 {existingImages.length} / 신규 {newImages.length})
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "#667085" }}>
            ✅ 이미지를 <b>드래그</b>해서 순서를 바꿀 수 있어요. (저장해야 DB/스토리지에 반영됩니다)
          </div>

          <div style={styles.grid}>
            {mergedImages.map((img: any, idx: number) => {
              const src = img.kind === "existing" ? img.url : img.previewUrl;
              const key = img.kind === "existing" ? img.storage_path : img.previewUrl;

              return (
                <div
                  key={key}
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex == null || dragIndex === idx) return;
                    const next = reorder(mergedImages, dragIndex, idx);
                    normalizeAfterMerged(next);
                    setDragIndex(null);
                  }}
                  style={{
                    ...styles.card,
                    cursor: "grab",
                    outline: dragIndex === idx ? "2px solid #111" : "none",
                  }}
                  title="드래그해서 순서 변경"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" style={styles.thumb} />
                  <div style={styles.caption}>
                    #{img.sort_order} · {img.kind === "existing" ? "기존" : "신규"}
                  </div>

                  {img.kind === "existing" ? (
                    <button
                      type="button"
                      onClick={() => removeExistingByPath(img.storage_path)}
                      style={{ ...styles.btn, marginTop: 8, borderColor: "#ff3b30", color: "#ff3b30" }}
                    >
                      삭제
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeNewByPreview(img.previewUrl)}
                      style={{ ...styles.btn, marginTop: 8, borderColor: "#ff3b30", color: "#ff3b30" }}
                    >
                      삭제
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button disabled={saving} onClick={saveAll} style={styles.btn}>
            {saving ? "저장중..." : "저장"}
          </button>
          <button onClick={() => router.back()} style={{ ...styles.btn, borderColor: "#ddd" }}>
            뒤로
          </button>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ fontSize: 12, color: "#666", fontWeight: 800 }}>{label}</label>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  input: { width: "100%", border: "1px solid #ddd", borderRadius: 12, padding: "10px 12px" },
  textarea: { width: "100%", border: "1px solid #ddd", borderRadius: 12, padding: "10px 12px" },
  btn: { border: "1px solid #111", borderRadius: 12, padding: "10px 12px", fontWeight: 800, background: "#fff", cursor: "pointer" },

  grid: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    marginTop: 12,
  },
  card: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 10,
    background: "#fff",
  },
  thumb: { width: "100%", height: 140, objectFit: "cover", borderRadius: 12, background: "#F2F4F7" },
  caption: { marginTop: 8, fontSize: 12, color: "#475467", wordBreak: "break-all", lineHeight: 1.3 },
};