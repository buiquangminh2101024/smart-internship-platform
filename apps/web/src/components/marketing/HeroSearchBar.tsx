"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCities } from "@/hooks/useCatalog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

/**
 * Thanh tìm kiếm trên trang chủ — chuyển hướng sang /jobs với query params.
 * Tách ra client component vì trang chủ (page.tsx) là Server Component.
 */
export function HeroSearchBar() {
  const router = useRouter();
  const { data: cities } = useCities();
  const [q, setQ] = useState("");
  const [cityId, setCityId] = useState("");

  function handleSearch() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (cityId) params.set("cityId", cityId);
    const qs = params.toString();
    router.push(qs ? `/jobs?${qs}` : "/jobs");
  }

  return (
    <Card padding="none" className="flex max-w-2xl flex-col gap-2 rounded-2xl border-border-default bg-white p-2 shadow-[0_20px_48px_-12px_rgba(13,17,23,0.12)] sm:flex-row sm:items-center">
      <div className="flex-[1.5]">
        <Input
          icon="search"
          placeholder="Vị trí, kỹ năng hoặc công ty..."
          className="border-transparent bg-transparent focus:border-transparent focus:ring-0"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
        />
      </div>
      <div className="hidden h-7 w-px bg-border-subtle sm:block" />
      <select
        value={cityId}
        onChange={(e) => setCityId(e.target.value)}
        className="h-11 w-full flex-1 rounded-xl border border-transparent bg-transparent px-3 text-[15px] font-medium text-text-body outline-none transition-colors hover:bg-surface-hover focus:bg-white"
      >
        <option value="">Tất cả khu vực</option>
        {(cities ?? []).map((city) => (
          <option key={city.id} value={city.id}>
            {city.name}
          </option>
        ))}
      </select>
      <Button type="button" size="md" icon="search" onClick={handleSearch} className="shrink-0 sm:px-6">
        Tìm cơ hội
      </Button>
    </Card>
  );
}
