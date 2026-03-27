
import React from 'react';
import { BrandChipLink } from './BrandChipLink';

interface PmBrandGroup {
  pmName: string;
  brands: {
    name: string;
  }[];
}

interface PmBrandGroupCardProps {
  group: PmBrandGroup;
}

export const PmBrandGroupCard: React.FC<PmBrandGroupCardProps> = ({ group }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{group.pmName}</h3>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
          {group.brands.length} 個品牌
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {group.brands.map((brand) => (
          <BrandChipLink key={brand.name} name={brand.name} />
        ))}
      </div>
    </div>
  );
};
