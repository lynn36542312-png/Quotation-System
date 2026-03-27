
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FileText, RefreshCw, Upload } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { findBrand } from '../data/brandDirectory';

interface SourceFile {
  id: string;
  originalFileName: string;
  fileType: string;
  uploadedAt: string;
  parseStatus: 'pending' | 'processing' | 'success' | 'error';
  parseMessage?: string;
  product: string;
  pm: string;
  documentType: string;
  status: 'active' | 'inactive';
}

export default function BrandFilesPage() {
  const { brandName = '' } = useParams();
  const brand = useMemo(() => findBrand(brandName), [brandName]);
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('品牌文件');
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      if (!res.ok) return;
      const data = await res.json();
      setFiles(data);
    } catch (error) {
      console.error('Failed to fetch files:', error);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const filteredFiles = useMemo(
    () =>
      files
        .filter((item) => brand && item.product?.toLowerCase() === brand.brand.toLowerCase())
        .sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt)),
    [files, brand]
  );

  const uploadFile = async () => {
    if (!selectedFile || !brand) return;
    setIsUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('product', brand.brand);
    formData.append('pm', brand.pdm);
    formData.append('documentType', documentType);

    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Upload failed');
      }

      setSelectedFile(null);
      setDocumentType('品牌文件');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setMessage('上傳成功，系統已開始解析檔案。');
      fetchFiles();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? `上傳失敗：${error.message}` : '上傳失敗');
    } finally {
      setIsUploading(false);
    }
  };

  if (!brand) {
    return (
      <div className="p-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">找不到品牌</h1>
          <p className="text-sm text-gray-600 mb-4">目前沒有 {decodeURIComponent(brandName)} 的資料。</p>
          <Link to="/admin/pm-owners" className="text-blue-600 hover:text-blue-700 font-medium">
            返回 PM 負責品牌
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto bg-gray-50">
      <div className="mb-4">
        <Link
          to="/admin/pm-owners"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600"
        >
          <ArrowLeft size={16} />
          返回 PM 負責品牌
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{brand.brand}</h1>
            <p className="text-sm text-gray-500 mt-1">品牌資訊與上傳入口</p>
          </div>

          <InfoBlock label="廠牌" value={brand.brand} />
          <InfoBlock label="料號編列" value={brand.skuOwner || '—'} />
          <InfoBlock label="負責 PDM" value={brand.pdm || '—'} />
          <InfoBlock label="PDM及代理人資訊" value={brand.contact || '—'} multiline />

          <div className="border-t border-gray-200 pt-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">上傳檔案</h2>

            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.doc,.docx,.pdf,.ppt,.pptx,.txt,.csv"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700"
              />

              <input
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value)}
                placeholder="文件類型，例如：價格表 / 促案 / 產品文件"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />

              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                <div><span className="font-medium">品牌：</span>{brand.brand}</div>
                <div><span className="font-medium">PDM：</span>{brand.pdm}</div>
                <div><span className="font-medium">料號編列：</span>{brand.skuOwner || '—'}</div>
              </div>

              <button
                onClick={uploadFile}
                disabled={!selectedFile || isUploading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isUploading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                {isUploading ? '上傳中...' : '上傳檔案'}
              </button>

              {message && (
                <div className={`text-sm rounded-lg px-3 py-2 ${message.includes('失敗') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                  {message}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">已上傳檔案</h2>
              <p className="text-sm text-gray-500 mt-1">
                此品牌下所有啟用的已上傳檔案皆可被 Sales 搜尋。
                （目前畫面僅顯示 product = {brand.brand} 的檔案）
              </p>
            </div>
            <button
              onClick={fetchFiles}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw size={16} />
              重新整理
            </button>
          </div>

          {filteredFiles.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="mx-auto mb-3 text-gray-300" size={32} />
              <p>目前這個品牌還沒有檔案。</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredFiles.map((file) => (
                <li key={file.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{file.originalFileName}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1">文件類型：{file.documentType || '未填寫'}</span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1">PDM：{file.pm || '未填寫'}</span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1">狀態：{file.status}</span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1">解析：{file.parseStatus}</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(file.uploadedAt).toLocaleString()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function InfoBlock({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className={`text-sm text-gray-900 ${multiline ? 'whitespace-pre-line leading-6' : ''}`}>{value}</div>
    </div>
  );
}
