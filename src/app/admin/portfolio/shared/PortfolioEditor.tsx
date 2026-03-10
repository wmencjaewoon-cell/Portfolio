"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

const PYEONG_TO_M2 = 3.305785;

type CostItem = {
  work_name: string;      // 전체 시공명 (예: 철거공사)
  detail_name: string;    // 세부공사 (예: 마루철거)
  scope: string;          // 범위
  content: string;        // 내용
  product_name: string;   // 제품명
  unit: string;           // 단위
  quantity: number;       // 수량
  unit_price: number;     // 단가
  amount: number;         // 금액 = 수량 * 단가
  note?: string;          // 메모
};

const SCOPE_OPTIONS = ["전체", "부분", "확장", "도배", "바닥", "욕실", "주방", "가구", "기타"] as const;
const HOUSING_OPTIONS = ["아파트", "오피스텔", "주택", "빌라"] as const;

function parseTags(s: string) {
  return Array.from(new Set(s.split(",").map((v) => v.trim()).filter(Boolean)));
}
function round(n: number, d = 2) {
  const m = Math.pow(10, d);
  return Math.round(n * m) / m;
}
function toIntOrNull(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function toNumberOrNull(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function isValidYouTubeUrl(url: string) {
  const u = url.trim();
  if (!u) return true;
  return /youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/shorts\//i.test(u);
}

type LoadedPost = {
  id: string;
  title: string | null;
  region_sido: string | null;
  region_sigungu: string | null;
  construction_year: number;
  area_m2: number | null;
  housing_type: string | null;
  scope_type: string | null;
  scope_detail: string | null;
  style: string | null;
  contractor_name: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string;
  total_cost: number | null;
  detail_subtotal?: number | null;
  profit_rate?: number | null;
  discount_amount?: number | null;
  is_published: boolean;
  youtube_url?: string | null;
  video_storage_path?: string | null;
};

type LoadedCostRow = {
  work_name: string | null;
  detail_name: string | null;
  scope: string | null;
  content: string | null;
  product_name: string | null;
  unit: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  note: string | null;
  sort_order: number | null;
};
type LoadedImgRow = { storage_path: string; sort_order: number };

function getPublicUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export default function PortfolioEditor({ editId }: { editId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(!!editId);
  const [saving, setSaving] = useState(false);
  const [importingPdf, setImportingPdf] = useState(false);

  const [postId, setPostId] = useState<string | null>(editId ?? null);

  // ===== 기본정보 =====
  const [title, setTitle] = useState("");
  const [regionSido, setRegionSido] = useState("");
  const [regionSigungu, setRegionSigungu] = useState("");
  const [constructionYear, setConstructionYear] = useState(String(new Date().getFullYear()));

  const [areaPyeong, setAreaPyeong] = useState("");
  const areaM2 = useMemo(() => {
    const p = Number(areaPyeong);
    if (!Number.isFinite(p) || p <= 0) return 0;
    return p * PYEONG_TO_M2;
  }, [areaPyeong]);

  const [housingType, setHousingType] = useState("");
  const [scopeType, setScopeType] = useState("");
  const [scopeDetail, setScopeDetail] = useState("");

  const [style, setStyle] = useState("");
  const [contractorName, setContractorName] = useState("");

  const [workNameOptions, setWorkNameOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [description, setDescription] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [profitRate, setProfitRate] = useState(""); // 예: 10
  const [discountAmount, setDiscountAmount] = useState(""); // 차감 금액
  const [tags, setTags] = useState("");

  // 비용 상세
  const [costs, setCosts] = useState<CostItem[]>([]);
const costSum = useMemo(() => {
  return costs.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}, [costs]);

const profitAmount = useMemo(() => {
  const rate = Number(profitRate) || 0;
  return Math.round(costSum * (rate / 100));
}, [costSum, profitRate]);

const minusAmount = useMemo(() => {
  return Number(discountAmount) || 0;
}, [discountAmount]);

const finalTotal = useMemo(() => {
  return costSum + profitAmount - minusAmount;
}, [costSum, profitAmount, minusAmount]);

  // 이미지(기존 + 신규)
  const [existingImages, setExistingImages] = useState<Array<{ url: string; sort_order: number; storage_path: string }>>(
    []
  );
  const [newImages, setNewImages] = useState<Array<{ file: File; sort_order: number; previewUrl: string }>>([]);

  function reorder<T>(arr: T[], from: number, to: number) {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// 기존 + 신규를 합친 "표시용" 배열 만들기
const mergedImages = useMemo(() => {
  const ex = existingImages
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((x) => ({ kind: "existing" as const, ...x }));

  const nw = newImages
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((x) => ({ kind: "new" as const, ...x }));

  // sort_order 기준으로 섞기
  return [...ex, ...nw].sort((a: any, b: any) => a.sort_order - b.sort_order);
}, [existingImages, newImages]);

const [dragIndex, setDragIndex] = useState<number | null>(null);

function normalizeAfterMerged(newMerged: any[]) {
  // merged의 순서대로 sort_order를 1..N으로 재부여하고
  // existing/new 각각에 다시 반영
  const normalized = newMerged.map((x, i) => ({ ...x, sort_order: i + 1 }));

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
  // 영상
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoStoragePath, setVideoStoragePath] = useState<string | null>(null);
  const [pickedVideo, setPickedVideo] = useState<File | null>(null);

  // ===== 로그인 체크 + 수정 로드 =====
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        alert("로그인 필요");
        router.push("/");
        return;
      }

      if (!editId) return;

      try {
        setLoading(true);

        const { data: post, error } = await supabase.from("portfolio_posts").select("*").eq("id", editId).single();
        if (error || !post) throw error ?? new Error("글을 불러오지 못했습니다.");

        const p = post as LoadedPost;
        if (!alive) return;

        setPostId(p.id);
        setTitle(p.title ?? "");
        setRegionSido(p.region_sido ?? "");
        setRegionSigungu(p.region_sigungu ?? "");
        setConstructionYear(String(p.construction_year ?? new Date().getFullYear()));

        const m2 = Number(p.area_m2 ?? 0);
        setAreaPyeong(m2 > 0 ? String(round(m2 / PYEONG_TO_M2, 2)) : "");

        setHousingType(p.housing_type ?? "");
        setScopeType(p.scope_type ?? "");
        setScopeDetail(p.scope_detail ?? "");

        setStyle(p.style ?? "");
        setContractorName(p.contractor_name ?? "");
        setStartDate(p.start_date ?? "");
        setEndDate(p.end_date ?? "");
        setDescription(p.description ?? "");
        setTotalCost(p.total_cost != null ? String(p.total_cost) : "");
        setProfitRate(p.profit_rate != null ? String(p.profit_rate) : "");
        setDiscountAmount(p.discount_amount != null ? String(p.discount_amount) : "");

        setYoutubeUrl(p.youtube_url ?? "");
        setVideoStoragePath(p.video_storage_path ?? null);
        setPickedVideo(null);

        const { data: tagRows } = await supabase.from("portfolio_post_tags").select("tags(name)").eq("post_id", p.id);
        const t = (tagRows ?? []).map((r: any) => r.tags?.name).filter(Boolean);
        setTags(t.join(","));

        const { data: costRows, error: costErr } = await supabase
        .from("portfolio_cost_items")
        .select(`
          work_name,
          detail_name,
          scope,
          content,
          product_name,
          unit,
          quantity,
          unit_price,
          amount,
          note,
          sort_order
        `)
        .eq("post_id", p.id)
        .order("sort_order", { ascending: true });
        if (costErr) throw costErr;

        const loaded = (costRows ?? []) as unknown as LoadedCostRow[];

setCosts(
  loaded.map((r) => ({
    work_name: r.work_name ?? "",
    detail_name: r.detail_name ?? "",
    scope: r.scope ?? "",
    content: r.content ?? "",
    product_name: r.product_name ?? "",
    unit: r.unit ?? "",
    quantity: Number(r.quantity ?? 0) || 0,
    unit_price: Number(r.unit_price ?? 0) || 0,
    amount: Number(r.amount ?? 0) || 0,
    note: r.note ?? "",
  }))
);

// 저장된 값으로 시공명/단위 옵션 복구
const loadedWorkNames = Array.from(
  new Set(
    loaded
      .map((r) => (r.work_name ?? "").trim())
      .filter(Boolean)
  )
);

const loadedUnits = Array.from(
  new Set(
    loaded
      .map((r) => (r.unit ?? "").trim())
      .filter(Boolean)
  )
);

setWorkNameOptions((prev) =>
  Array.from(new Set([...prev, ...loadedWorkNames]))
);

setUnitOptions((prev) =>
  Array.from(new Set([...prev, ...loadedUnits]))
);
        const { data: imgRows, error: imgErr } = await supabase
          .from("portfolio_images")
          .select("storage_path, sort_order")
          .eq("post_id", p.id)
          .order("sort_order", { ascending: true });
        if (imgErr) throw imgErr;

        const imgs = (imgRows ?? []) as LoadedImgRow[];
        setExistingImages(
          imgs.map((r) => ({
            storage_path: r.storage_path,
            sort_order: r.sort_order,
            url: getPublicUrl("portfolio-images", r.storage_path),
          }))
        );
      } catch (e: any) {
        console.error(e);
        alert(e?.message || "불러오기 실패");
        router.back();
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [editId, router]);

  // ===== 유효성 =====
  function validate(forPublish: boolean) {
    const errs: string[] = [];

    if (!regionSido.trim()) errs.push("지역(시/도)");
    if (!regionSigungu.trim()) errs.push("지역(시/군/구)");
    if (!housingType.trim()) errs.push("주거유형");
    if (!scopeType.trim()) errs.push("시공범위");
    if (scopeType === "기타" && !scopeDetail.trim()) errs.push("시공범위 기타 상세");

    const cy = toIntOrNull(constructionYear);
    if (!cy) errs.push("시공연도");
    if (!(Number(areaPyeong) > 0)) errs.push("면적(평)");
    if (!isValidYouTubeUrl(youtubeUrl)) errs.push("유튜브 링크 형식");

    if (forPublish) {
      if (!title.trim()) errs.push("제목(게시 시 필수)");
      if (!description.trim()) errs.push("설명(게시 시 필수)");
    }

    if (errs.length) {
      alert("필수값 확인:\n" + errs.map((x) => `- ${x}`).join("\n"));
      return false;
    }
    return true;
  }

  // ===== 비용 UI =====
  function addCostRow() {
    setCosts((prev) => [
      ...prev,
      {
        work_name: "",
        detail_name: "",
        scope: "",
        content: "",
        product_name: "",
        unit: "",
        quantity: 0,
        unit_price: 0,
        amount: 0,
        note: "",
      },
    ]);
  }

  async function importEstimatePdf(file: File) {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/estimate-parser", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.message || "견적서 불러오기 실패");
    }

    setWorkNameOptions(data.workNameOptions ?? []);
    setUnitOptions(data.unitOptions ?? []);

    alert("견적서에서 시공명/단위 목록을 불러왔습니다.");
  } catch (e: any) {
    console.error(e);
    alert(e?.message || "견적서 불러오기 실패");
  }
}

function updateCost(idx: number, patch: Partial<CostItem>) {
  setCosts((prev) => {
    const next = [...prev];
    const updated = { ...next[idx], ...patch };

    const qty = Number(updated.quantity) || 0;
    const unitPrice = Number(updated.unit_price) || 0;
    updated.amount = qty * unitPrice;

    next[idx] = updated;
    return next;
  });
}
  function removeCost(idx: number) {
    setCosts((prev) => prev.filter((_, i) => i !== idx));
  }

  // ===== 이미지 선택 =====
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

  function removeNewImage(idx: number) {
    setNewImages((prev) => {
      const target = prev[idx];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((_, i) => i !== idx);
      const start = existingImages.length;
      return next.map((x, i) => ({ ...x, sort_order: start + i + 1 }));
    });
  }

  async function handleEstimatePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    setImportingPdf(true);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/estimate-parser", {
      method: "POST",
      body: formData,
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.message || "견적서 불러오기 실패");
      return;
    }

    // 기존 값 덮어쓰기
    setCosts(json.costs || []);
    setProfitRate(json.profitRate != null ? String(json.profitRate) : "");
    setTotalCost(json.totalCost != null ? String(json.totalCost) : "");
  } catch (err: any) {
    console.error(err);
    alert(err?.message || "견적서 불러오기 실패");
  } finally {
    setImportingPdf(false);
  }
}




  // ===== 영상 업로드 =====
  async function uploadVideoIfNeeded(pid: string) {
    if (!pickedVideo) return videoStoragePath;

    const ext = (pickedVideo.name.split(".").pop() || "mp4").toLowerCase();
    const filePath = `${pid}/video.${ext}`;

    const { error } = await supabase.storage.from("portfolio-images").upload(filePath, pickedVideo, {
      upsert: true,
      contentType: pickedVideo.type || "video/mp4",
    });
    if (error) throw error;

    return filePath;
  }

  // ===== 저장/게시 =====
  async function saveAll(publish: boolean) {
    if (!validate(publish)) return;

    try {
      setSaving(true);

      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const session = sess.session;
      if (!session) {
        alert("로그인 필요");
        router.push("/");
        return;
      }

      const constructionYearNum = toIntOrNull(constructionYear) ?? new Date().getFullYear();


const payloadBase: any = {
  title: title.trim() || null,
  region_sido: regionSido.trim() || null,
  region_sigungu: regionSigungu.trim() || null,
  construction_year: constructionYearNum,
  detail_subtotal: costSum,
  profit_rate: Number(profitRate) || 0,
  discount_amount: Number(discountAmount) || 0,
  total_cost: totalCost.trim() === "" ? finalTotal : toNumberOrNull(totalCost.trim()),

  area_m2: areaM2 > 0 ? areaM2 : null,
  use_type: housingType.trim() || null,
  housing_type: housingType.trim() || null,
  scope_type: scopeType.trim() || null,
  scope_detail: scopeType === "기타" ? (scopeDetail.trim() || null) : null,

  style: style.trim() || null,
  contractor_name: contractorName.trim() || null,

  start_date: startDate || null,
  end_date: endDate || null,

  description: description.trim() || "",
  is_published: !!publish,
  youtube_url: youtubeUrl.trim() || null,
};

      let pid = postId;

      // 1) posts insert/update
      if (!pid) {
        const insertRow = {
          ...payloadBase,
          author_id: session.user.id,
          contractor_id: session.user.id,
          video_storage_path: null,
        };

        const { data, error } = await supabase.from("portfolio_posts").insert(insertRow).select("id").single();
        if (error) throw error;

        pid = data.id as string;
        setPostId(pid);
      } else {
        const { error } = await supabase
          .from("portfolio_posts")
          .update({ ...payloadBase, video_storage_path: videoStoragePath })
          .eq("id", pid);
        if (error) throw error;
      }

      // 2) video upload
      const newVideoPath = await uploadVideoIfNeeded(pid!);
      if (newVideoPath !== videoStoragePath) {
        setVideoStoragePath(newVideoPath ?? null);
        const { error } = await supabase.from("portfolio_posts").update({ video_storage_path: newVideoPath ?? null }).eq("id", pid!);
        if (error) throw error;
      }

      // 3) tags
      const tagArr = parseTags(tags);
      await supabase.from("portfolio_post_tags").delete().eq("post_id", pid);

      if (tagArr.length) {
        const { data: existingTags, error: exErr } = await supabase.from("tags").select("id,name").in("name", tagArr);
        if (exErr) throw exErr;

        const map = new Map<string, string>();
        for (const t of existingTags ?? []) map.set((t as any).name, (t as any).id);

        const missing = tagArr.filter((name) => !map.has(name));
        if (missing.length) {
          const { data: inserted, error: insErr } = await supabase.from("tags").insert(missing.map((name) => ({ name }))).select("id,name");
          if (!insErr) {
            for (const t of inserted ?? []) map.set((t as any).name, (t as any).id);
          } else {
            const { data: retry, error: retryErr } = await supabase.from("tags").select("id,name").in("name", missing);
            if (retryErr) throw retryErr;
            for (const t of retry ?? []) map.set((t as any).name, (t as any).id);
          }
        }

        const tagIds = Array.from(new Set(tagArr.map((name) => map.get(name)).filter(Boolean))) as string[];
        const links = tagIds.map((tag_id) => ({ post_id: pid, tag_id }));
        const { error: linkErr } = await supabase.from("portfolio_post_tags").upsert(links, { onConflict: "post_id,tag_id" } as any);
        if (linkErr) throw linkErr;
      }

      // 4) costs
// 4) costs
const cleanedCosts = costs
  .map((c, idx) => {
    const work_name = (c.work_name || "").trim();
    const detail_name = (c.detail_name || "").trim();
    const scope = (c.scope || "").trim() || null;
    const content = (c.content || "").trim() || null;
    const product_name = (c.product_name || "").trim() || null;
    const unit = (c.unit || "").trim() || null;
    const quantity = Number(c.quantity) || 0;
    const unit_price = Number(c.unit_price) || 0;
    const amount = quantity * unit_price;
    const note = c.note?.trim() || null;

    return {
      post_id: pid,
      sort_order: idx + 1,
      category: work_name || "기타",
      work_name,
      detail_name,
      scope,
      content,
      product_name,
      unit,
      quantity,
      unit_price,
      amount,
      note,
    };
  })
  .filter((c) => c.work_name.length > 0 || c.detail_name.length > 0);

      await supabase.from("portfolio_cost_items").delete().eq("post_id", pid);
      if (cleanedCosts.length) {
        const { error } = await supabase.from("portfolio_cost_items").insert(cleanedCosts);
        if (error) throw error;
      }

      // 5) images upload + portfolio_images upsert
      const sortedNew = [...newImages].sort((a, b) => a.sort_order - b.sort_order);

      for (const img of sortedNew) {
        const ext = (img.file.name.split(".").pop() || "jpg").toLowerCase();
        const filePath = `${pid}/${img.sort_order}.${ext}`;

        const { error: upErr } = await supabase.storage.from("portfolio-images").upload(filePath, img.file, {
          upsert: true,
          contentType: img.file.type || (ext === "png" ? "image/png" : "image/jpeg"),
        });
        if (upErr) throw upErr;

        const { error: rowErr } = await supabase
          .from("portfolio_images")
          .upsert({ post_id: pid, storage_path: filePath, sort_order: img.sort_order }, { onConflict: "post_id,sort_order" } as any);
        if (rowErr) throw rowErr;
      }

      // 업로드 후 리셋 + 수정페이지로 이동
      setNewImages((prev) => {
        prev.forEach((x) => URL.revokeObjectURL(x.previewUrl));
        return [];
      });

      alert(publish ? "게시되었습니다." : "임시저장 완료");
      router.push(`/admin/portfolio/${pid}`);
      router.refresh();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || e?.details || JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  }
async function onDeletePost() {
  if (!postId) return;

  const ok = confirm("정말 삭제할까요?\n이미지/영상/비용상세/태그 연결까지 함께 삭제됩니다.");
  if (!ok) return;

  try {
    setSaving(true);

    // 1) 현재 연결된 이미지/영상 경로 조회
    const { data: imgRows, error: imgErr } = await supabase
      .from("portfolio_images")
      .select("storage_path")
      .eq("post_id", postId);

    if (imgErr) throw imgErr;

    const { data: postRow, error: postErr } = await supabase
      .from("portfolio_posts")
      .select("id, video_storage_path")
      .eq("id", postId)
      .maybeSingle();

    if (postErr) throw postErr;

    const imagePaths = (imgRows ?? [])
      .map((r: any) => r.storage_path)
      .filter(Boolean) as string[];

    const videoPath = (postRow as any)?.video_storage_path as string | null;

    // 2) 관계 데이터 삭제
    const tagDel = await supabase
      .from("portfolio_post_tags")
      .delete()
      .eq("post_id", postId)
      .select("post_id");

    if (tagDel.error) throw tagDel.error;

    const costDel = await supabase
      .from("portfolio_cost_items")
      .delete()
      .eq("post_id", postId)
      .select("post_id");

    if (costDel.error) throw costDel.error;

    const imgDel = await supabase
      .from("portfolio_images")
      .delete()
      .eq("post_id", postId)
      .select("post_id");

    if (imgDel.error) throw imgDel.error;

    // 3) 본문 삭제
    const postDel = await supabase
      .from("portfolio_posts")
      .delete()
      .eq("id", postId)
      .select("id");

    if (postDel.error) throw postDel.error;

    if (!postDel.data || postDel.data.length === 0) {
      alert(
        "삭제가 0건 처리되었습니다.\n" +
          "RLS policy 때문에 delete 권한이 없을 가능성이 큽니다.\n" +
          "Supabase 정책을 확인하세요."
      );
      return;
    }

    // 4) 스토리지 파일 삭제
    const removePaths = [...imagePaths, ...(videoPath ? [videoPath] : [])];

    if (removePaths.length) {
      const { error: rmErr } = await supabase.storage
        .from("portfolio-images")
        .remove(removePaths);

      if (rmErr) {
        console.warn("storage remove warn:", rmErr);
        alert("DB 삭제는 완료됐지만 스토리지 파일 삭제는 실패했습니다.");
      }
    }

    alert("삭제 완료");
    router.push("/admin/portfolio");
    router.refresh();
  } catch (e: any) {
    console.error("delete failed:", e);
    alert(e?.message || e?.details || "삭제 실패");
  } finally {
    setSaving(false);
  }
}
  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) return <div style={styles.page}>불러오는 중…</div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{postId ? "포트폴리오 수정" : "포트폴리오 작성"}</div>
          {postId && <div style={{ fontSize: 12, color: "#666" }}>ID: {postId}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
  <button disabled={saving} onClick={() => saveAll(false)} style={styles.btn}>
    저장
  </button>

  <button
    disabled={saving}
    onClick={() => saveAll(true)}
    style={{ ...styles.btn, background: "#111", color: "#fff" }}
  >
    게시
  </button>

  {postId ? (
    <button
      disabled={saving}
      onClick={onDeletePost}
      style={{
        ...styles.btn,
        borderColor: "#ff3b30",
        color: "#ff3b30",
      }}
    >
      삭제
    </button>
  ) : null}

  <button
    onClick={logout}
    style={{ ...styles.btn, borderColor: "#ccc", color: "#333" }}
  >
    로그아웃
  </button>
</div>
      </div>

      <Section title="영상(선택)">
        <Label>유튜브 링크(선택)</Label>
        <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} style={styles.input} placeholder="https://youtu.be/..." />
        {!isValidYouTubeUrl(youtubeUrl) && <div style={{ color: "#c00", fontSize: 12, marginTop: 6 }}>유튜브 링크 형식을 확인해주세요.</div>}

        <Label>동영상 파일 업로드(선택)</Label>
        <input type="file" accept="video/*" onChange={(e) => setPickedVideo(e.target.files?.[0] ?? null)} />
        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
          현재 연결: {videoStoragePath ?? "(없음)"} / 선택됨: {pickedVideo?.name ?? "(없음)"}
        </div>
        {videoStoragePath && (
          <button onClick={() => setVideoStoragePath(null)} style={{ ...styles.btn, marginTop: 8 }}>
            영상 연결 해제(파일은 유지)
          </button>
        )}
      </Section>

<Section title="사진">
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <input type="file" accept="image/*" multiple onChange={(e) => onPickImages(e.target.files)} />
    <div style={{ fontSize: 13, color: "#475467", fontWeight: 700 }}>
      총 {mergedImages.length}장 (기존 {existingImages.length} / 새로 선택 {newImages.length})
    </div>
    <button
      type="button"
      onClick={() => {
        // 현재 merged 기준으로 1..N 재정렬
        normalizeAfterMerged(mergedImages);
      }}
      style={styles.btn}
    >
      순서 정리
    </button>
  </div>

  <div style={{ marginTop: 10, fontSize: 12, color: "#667085" }}>
    ✅ 이미지를 <b>드래그</b>해서 순서를 바꿀 수 있어요. (저장/게시를 눌러야 DB에 반영됩니다)
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

          {img.kind === "new" && (
            <button type="button" onClick={() => removeNewImage(newImages.findIndex((x) => x.previewUrl === img.previewUrl))} style={{ ...styles.btn, marginTop: 8 }}>
              신규 제거
            </button>
          )}
        </div>
      );
    })}
  </div>
</Section>

      <Section title="시공정보">
        <Label>제목(선택, 게시 시 필수)</Label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={styles.input} />

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <Label>지역(시/도)</Label>
            <input value={regionSido} onChange={(e) => setRegionSido(e.target.value)} style={styles.input} placeholder="예: 서울" />
          </div>
          <div style={{ flex: 1 }}>
            <Label>지역(시/군/구)</Label>
            <input value={regionSigungu} onChange={(e) => setRegionSigungu(e.target.value)} style={styles.input} placeholder="예: 강남" />
          </div>
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <Label>시공연도</Label>
            <input value={constructionYear} onChange={(e) => setConstructionYear(e.target.value)} style={styles.input} inputMode="numeric" />
          </div>
          <div style={{ flex: 1 }}>
            <Label>면적(평)</Label>
            <input value={areaPyeong} onChange={(e) => setAreaPyeong(e.target.value)} style={styles.input} inputMode="decimal" />
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>㎡ 환산: {areaM2 > 0 ? round(areaM2, 2).toLocaleString() : "0"} ㎡</div>
          </div>
        </div>

        <Label>주거유형</Label>
        <input value={housingType} onChange={(e) => setHousingType(e.target.value)} style={styles.input} placeholder={`예: ${HOUSING_OPTIONS.join("/")}`} />

        <Label>시공범위</Label>
        <input value={scopeType} onChange={(e) => setScopeType(e.target.value)} style={styles.input} placeholder={`예: ${SCOPE_OPTIONS.join("/")}`} />

        {scopeType === "기타" && (
          <>
            <Label>시공범위 상세(기타)</Label>
            <input value={scopeDetail} onChange={(e) => setScopeDetail(e.target.value)} style={styles.input} />
          </>
        )}

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <Label>스타일</Label>
            <input value={style} onChange={(e) => setStyle(e.target.value)} style={styles.input} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>시공사</Label>
            <input value={contractorName} onChange={(e) => setContractorName(e.target.value)} style={styles.input} placeholder="예: 우명건축" />
          </div>
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <Label>시작일(YYYY-MM-DD)</Label>
            <input value={startDate} onChange={(e) => setStartDate(e.target.value)} style={styles.input} placeholder="2026-01-01" />
          </div>
          <div style={{ flex: 1 }}>
            <Label>종료일(YYYY-MM-DD)</Label>
            <input value={endDate} onChange={(e) => setEndDate(e.target.value)} style={styles.input} placeholder="2026-02-01" />
          </div>
        </div>

<Section title="견적서 PDF 불러오기">
  <input
    type="file"
    accept="application/pdf"
    onChange={(e) => {
      const file = e.target.files?.[0];
      if (file) importEstimatePdf(file);
    }}
  />
  <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
    1페이지에서 시공명 목록, 2페이지 이후에서 단위 목록을 자동으로 읽습니다.
  </div>

  {workNameOptions.length > 0 && (
    <div style={{ marginTop: 10, fontSize: 13 }}>
      <b>시공명 후보:</b> {workNameOptions.join(", ")}
    </div>
  )}

  {unitOptions.length > 0 && (
    <div style={{ marginTop: 6, fontSize: 13 }}>
      <b>단위 후보:</b> {unitOptions.join(", ")}
    </div>
  )}
</Section>

        <Label>총비용(직접 입력하지 않으면 자동 계산값 저장)</Label>
<input
  value={totalCost}
  onChange={(e) => setTotalCost(e.target.value)}
  style={styles.input}
  inputMode="numeric"
  placeholder={`자동 계산값: ${finalTotal.toLocaleString()}`}
/>
<div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
  상세 소계: {costSum.toLocaleString()} 원 / 이윤: {profitAmount.toLocaleString()} 원 / 차감: {minusAmount.toLocaleString()} 원 / 자동 총비용: {finalTotal.toLocaleString()} 원
</div>
      </Section>

<Section title="비용 상세(자동 계산)">
  <button onClick={addCostRow} style={styles.btn}>+ 공종 추가</button>

  <div style={{ marginTop: 12, overflowX: "auto" }}>
    <div style={{ minWidth: 1400 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "160px 160px 140px 180px 180px 90px 90px 120px 120px 140px 100px",
          gap: 8,
          marginBottom: 10,
          fontWeight: 900,
          fontSize: 13,
          color: "#344054",
        }}
      >
        <div>시공명</div>
        <div>세부공사</div>
        <div>범위</div>
        <div>내용</div>
        <div>제품명</div>
        <div>단위</div>
        <div>수량</div>
        <div>단가</div>
        <div>금액</div>
        <div>메모</div>
        <div>삭제</div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {costs.map((c, idx) => (
          <div
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns: "160px 160px 140px 180px 180px 90px 90px 120px 120px 140px 100px",
              gap: 8,
              alignItems: "start",
            }}
          >
            <select
              style={styles.input}
              value={c.work_name ?? ""}
              onChange={(e) => updateCost(idx, { work_name: e.target.value })}
            >
              <option value="">시공명 선택</option>
              {workNameOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <input
              style={styles.input}
              placeholder="예: 마루철거"
              value={c.detail_name}
              onChange={(e) => updateCost(idx, { detail_name: e.target.value })}
            />

            <input
              style={styles.input}
              placeholder="범위"
              value={c.scope}
              onChange={(e) => updateCost(idx, { scope: e.target.value })}
            />

            <input
              style={styles.input}
              placeholder="내용"
              value={c.content}
              onChange={(e) => updateCost(idx, { content: e.target.value })}
            />

            <input
              style={styles.input}
              placeholder="제품명"
              value={c.product_name}
              onChange={(e) => updateCost(idx, { product_name: e.target.value })}
            />

            <select
              style={styles.input}
              value={c.unit ?? ""}
              onChange={(e) => updateCost(idx, { unit: e.target.value })}
            >
              <option value="">단위 선택</option>
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>

            <input
              style={styles.input}
              placeholder="수량"
              inputMode="numeric"
              value={String(c.quantity ?? 0)}
              onChange={(e) => updateCost(idx, { quantity: Number(e.target.value) || 0 })}
            />

            <input
              style={styles.input}
              placeholder="단가"
              inputMode="numeric"
              value={String(c.unit_price ?? 0)}
              onChange={(e) => updateCost(idx, { unit_price: Number(e.target.value) || 0 })}
            />

            <input
              style={{ ...styles.input, background: "#F9FAFB", fontWeight: 800 }}
              value={(Number(c.amount) || 0).toLocaleString()}
              readOnly
            />

            <input
              style={styles.input}
              placeholder="메모"
              value={c.note ?? ""}
              onChange={(e) => updateCost(idx, { note: e.target.value })}
            />

            <button onClick={() => removeCost(idx)} style={styles.btn}>삭제</button>
          </div>
        ))}
      </div>
    </div>
  </div>

  <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
    <div style={{ fontSize: 14, fontWeight: 800 }}>
      소계: {costSum.toLocaleString()} 원
    </div>

    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ minWidth: 120, fontWeight: 800 }}>기업 이윤 (%)</div>
      <input
        value={profitRate}
        onChange={(e) => setProfitRate(e.target.value)}
        style={{ ...styles.input, maxWidth: 160 }}
        inputMode="numeric"
        placeholder="예: 10"
      />
      <div style={{ fontSize: 14, color: "#475467" }}>
        이윤 금액: {profitAmount.toLocaleString()} 원
      </div>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
  <div style={{ minWidth: 120, fontWeight: 800 }}>차감 금액</div>
  <input
    value={discountAmount}
    onChange={(e) => setDiscountAmount(e.target.value)}
    style={{ ...styles.input, maxWidth: 160 }}
    inputMode="numeric"
    placeholder="예: 500000"
  />
  <div style={{ fontSize: 14, color: "#475467" }}>
    차감 적용: {minusAmount.toLocaleString()} 원
  </div>
</div>

    <div style={{ fontSize: 16, fontWeight: 900 }}>
      총비용(상세 합계 + 이윤): {finalTotal.toLocaleString()} 원
    </div>
  </div>
</Section>

      <Section title="시공 설명 / 태그">
        <Label>설명(게시 시 필수)</Label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={styles.textarea} />
        <Label>태그(쉼표)</Label>
        <input value={tags} onChange={(e) => setTags(e.target.value)} style={styles.input} placeholder="예: 미니멀,화이트,카페" />
      </Section>

      <div style={{ height: 16 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
  <button disabled={saving} onClick={() => saveAll(false)} style={styles.btn}>
    저장
  </button>

  <button
    disabled={saving}
    onClick={() => saveAll(true)}
    style={{ ...styles.btn, background: "#111", color: "#fff" }}
  >
    게시
  </button>

  {postId ? (
    <button
      disabled={saving}
      onClick={onDeletePost}
      style={{
        ...styles.btn,
        borderColor: "#ff3b30",
        color: "#ff3b30",
      }}
    >
      삭제
    </button>
  ) : null}

  <button
    onClick={logout}
    style={{ ...styles.btn, borderColor: "#ccc", color: "#333" }}
  >
    로그아웃
  </button>
</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={styles.section}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={styles.label}>{children}</div>;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1650,
    margin: "24px auto",
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
    color: "#101828",
    background: "#fff",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },

  section: {
    border: "1px solid #EAECF0",
    borderRadius: 16,
    padding: 16,
    marginTop: 14,
    background: "#fff",
    boxShadow: "0 1px 2px rgba(16,24,40,0.06)",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 900,
    margin: 0,
    marginBottom: 12,
    color: "#101828",
  },

  label: {
    fontSize: 13,
    color: "#344054",
    marginTop: 12,
    marginBottom: 8,
    fontWeight: 800,
  },

  input: {
    width: "100%",
    border: "1px solid #D0D5DD",
    borderRadius: 14,
    padding: "12px 14px",
    background: "#fff",
    fontSize: 16,
    color: "#101828",
    outline: "none",
  },

  textarea: {
    width: "100%",
    minHeight: 140,
    border: "1px solid #D0D5DD",
    borderRadius: 14,
    padding: "12px 14px",
    background: "#fff",
    fontSize: 16,
    color: "#101828",
    outline: "none",
  },

  btn: {
    border: "1px solid #101828",
    borderRadius: 14,
    padding: "12px 14px",
    background: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 14,
  },

  row: { display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" },

  grid: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    marginTop: 10,
  },

  card: {
    border: "1px solid #EAECF0",
    borderRadius: 14,
    padding: 10,
    background: "#fff",
  },

  thumb: { width: "100%", height: 140, objectFit: "cover", borderRadius: 12, background: "#F2F4F7" },

  caption: {
    marginTop: 8,
    fontSize: 12,
    color: "#475467",
    wordBreak: "break-all",
    lineHeight: 1.3,
  },

  costCard: {
    border: "1px solid #EAECF0",
    borderRadius: 14,
    padding: 12,
    display: "grid",
    gap: 10,
    background: "#fff",
  },
};


