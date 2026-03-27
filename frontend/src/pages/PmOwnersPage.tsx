
import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { PmBrandGroupCard } from '../components/PmBrandGroupCard';
import { groupedByPdm } from '../data/brandDirectory';

export default function PmOwnersPage() {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return groupedByPdm.map((group) => ({
        pmName: group.pmName,
        brands: group.brands.map((item) => ({ name: item.brand })),
      }));
    }

    return groupedByPdm
      .map((group) => ({
        pmName: group.pmName,
        brands: group.brands
          .filter(
            (item) =>
              item.brand.toLowerCase().includes(keyword) ||
              item.skuOwner.toLowerCase().includes(keyword) ||
              item.pdm.toLowerCase().includes(keyword) ||
              item.contact.toLowerCase().includes(keyword)
          )
          .map((item) => ({ name: item.brand })),
      }))
      .filter((group) => group.brands.length > 0);
  }, [query]);

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PM 負責品牌分類</h1>
          <p className="text-sm text-gray-500 mt-1">資料來源：2026 DC 料號編列.xlsx。點品牌可進入品牌檔案上傳頁。</p>
        </div>

        <label className="relative block w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋品牌、PDM、料號編列..."
            className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <PmBrandGroupCard key={group.pmName} group={group} />
        ))}
      </div>
    </div>
  );
}
