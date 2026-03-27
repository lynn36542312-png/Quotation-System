
import React from 'react';
import { Link } from 'react-router-dom';

interface BrandChipLinkProps {
  name: string;
}

export const BrandChipLink: React.FC<BrandChipLinkProps> = ({ name }) => {
  return (
    <Link
      to={`/admin/brands/${encodeURIComponent(name)}`}
      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
    >
      {name}
    </Link>
  );
};
