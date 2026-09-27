"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Input } from "@/components/ui/Input";
import { usePublicCompaniesList } from "@/hooks/useCompany";
import { MapPin, ChevronRight, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function CompaniesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500); // Độ trễ 500ms
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: companies, isLoading } = usePublicCompaniesList(debouncedSearchTerm);

  return (
    <div className="min-h-screen bg-bg-surface">
      <CandidateHomeHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[calc(100vh-200px)]">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-strong mb-4">Danh sách công ty</h1>
          <p className="text-text-body mb-6">
            Khám phá các công ty hàng đầu và tìm kiếm cơ hội thực tập phù hợp với bạn.
          </p>
          <div className="max-w-xl">
            <Input
              placeholder="Tìm kiếm công ty theo tên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon="search"
              className="bg-white"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="animate-pulse bg-white rounded-xl h-80 border border-border-default"></div>
            ))}
          </div>
        ) : companies && companies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {companies.map((company) => (
              <Link key={company.id} href={`/companies/${company.id}`} className="block group">
                <div className="bg-white rounded-xl border border-border-default overflow-hidden transition-all hover:shadow-lg h-full flex flex-col relative">
                  {/* Decorative background arcs */}
                  <div className="absolute top-0 left-0 right-0 h-32 overflow-hidden bg-neutral-50/50 pointer-events-none">
                    <div className="absolute top-[-50%] left-1/2 -translate-x-1/2 w-[150%] aspect-square rounded-full border border-neutral-100"></div>
                    <div className="absolute top-[-40%] left-1/2 -translate-x-1/2 w-[130%] aspect-square rounded-full border border-neutral-100"></div>
                    <div className="absolute top-[-30%] left-1/2 -translate-x-1/2 w-[110%] aspect-square rounded-full border border-neutral-100"></div>
                  </div>

                  <div className="p-6 flex flex-col items-center flex-1 relative z-10">
                    <div className="w-24 h-24 bg-white rounded-xl shadow-sm border border-border-default flex items-center justify-center p-2 mb-4 overflow-hidden relative">
                      {company.logoUrl ? (
                        <Image
                          src={company.logoUrl}
                          alt={company.name}
                          fill
                          className="object-contain p-2"
                          sizes="96px"
                        />
                      ) : (
                        <div className="text-3xl font-bold text-text-muted">
                          {company.name.charAt(0)}
                        </div>
                      )}
                    </div>

                    <h3 className="text-xl font-bold text-text-strong text-center mb-4 group-hover:text-primary-600 transition-colors">
                      {company.name}
                    </h3>

                    {/* Placeholder spacing to push footer down */}
                    <div className="flex-1"></div>
                  </div>

                  {/* Footer */}
                  <div className="bg-neutral-50 px-6 py-4 flex items-center justify-between border-t border-border-default">
                    <div className="flex items-center text-sm font-medium text-text-body">
                      {company.city || "Nhiều khu vực"}
                    </div>
                    <div className="flex items-center gap-1 text-sm font-medium">
                      <div className="w-2 h-2 rounded-full bg-green-500 mr-1 ring-4 ring-green-100"></div>
                      <span className="text-text-strong">{company.jobCount || 0} Việc làm</span>
                      <ChevronRight className="w-4 h-4 ml-1 text-text-muted group-hover:text-primary-600 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-xl border border-border-default">
            <h3 className="text-lg font-bold text-text-strong mb-2">Không tìm thấy công ty nào</h3>
            <p className="text-text-body">Thử tìm kiếm với từ khóa khác.</p>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
