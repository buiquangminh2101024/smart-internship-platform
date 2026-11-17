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
    <Card padding="sm" className="flex max-w-xl flex-col gap-2 sm:flex-row">
      <Input
        icon="search"
        placeholder="Vị trí, kỹ năng hoặc công ty"
        className="flex-[1.4]"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
      />
      <select
        value={cityId}
        onChange={(e) => setCityId(e.target.value)}
        className="h-11 w-full flex-1 rounded-lg border border-border-default bg-white px-3 text-[15px] outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      >
        <option value="">Tất cả khu vực</option>
        {(cities ?? []).map((city) => (
          <option key={city.id} value={city.id}>
            {city.name}
          </option>
        ))}
      </select>
      <Button type="button" icon="search" onClick={handleSearch}>
        Tìm việc
      </Button>
    </Card>
  );
}
